const { Server } = require("socket.io");
const User = require("../models/User");
const { verifyToken } = require("../utils/jwt");
const env = require("../config/env");
const { setIO } = require("../config/socket");
const chatService = require("../services/chatService");
const { QUEUE_ROOM_NAME, getTripRoomName } = require("../services/socketService");

const initSocketServer = (httpServer) => {
  const io = new Server(httpServer, {
    cors: {
      origin: env.socketCorsOrigins,
      methods: ["GET", "POST"],
      credentials: true,
    },
  });

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.replace("Bearer ", "");
      if (!token) {
        return next(new Error("Unauthorized"));
      }

      const decoded = verifyToken(token);
      const user = await User.findById(decoded.sub).select("-password");
      if (!user || user.status !== "active") {
        return next(new Error("Unauthorized"));
      }

      socket.user = user;
      return next();
    } catch (_error) {
      return next(new Error("Unauthorized"));
    }
  });

  io.on("connection", async (socket) => {
    const user = socket.user;
    const userId = user._id.toString();

    socket.join(`user:${userId}`);
    socket.join(`role:${user.role}`);

    socket.data.joinedQueueRoom = false;
    socket.data.tripRooms = new Set();

    const getTripRooms = () => {
      if (!(socket.data.tripRooms instanceof Set)) {
        socket.data.tripRooms = new Set();
      }

      return socket.data.tripRooms;
    };

    const joinQueueRoom = () => {
      if (socket.data.joinedQueueRoom) {
        return false;
      }

      socket.join(QUEUE_ROOM_NAME);
      socket.data.joinedQueueRoom = true;
      return true;
    };

    const leaveQueueRoom = () => {
      if (!socket.data.joinedQueueRoom) {
        return false;
      }

      socket.leave(QUEUE_ROOM_NAME);
      socket.data.joinedQueueRoom = false;
      return true;
    };

    const joinTripRoom = (rideId, options = {}) => {
      const tripRoom = getTripRoomName(rideId);
      const tripRooms = getTripRooms();
      const hasJoined = tripRooms.has(tripRoom);

      if (!hasJoined) {
        socket.join(tripRoom);
        tripRooms.add(tripRoom);
      }

      if (options.moveStudentFromQueue && socket.user.role === "student") {
        leaveQueueRoom();
      }

      return {
        room: tripRoom,
        joined: !hasJoined,
      };
    };

    const leaveTripRoom = (rideId) => {
      const tripRoom = getTripRoomName(rideId);
      const tripRooms = getTripRooms();

      if (!tripRooms.has(tripRoom)) {
        return false;
      }

      socket.leave(tripRoom);
      tripRooms.delete(tripRoom);
      return true;
    };

    const leaveAllTripRooms = () => {
      const tripRooms = getTripRooms();

      for (const roomName of tripRooms) {
        socket.leave(roomName);
      }

      tripRooms.clear();
    };

    try {
      const context = await chatService.getCurrentChatContext(socket.user._id);

      if (context?.queueRoom?.roomId === QUEUE_ROOM_NAME) {
        joinQueueRoom();
      }

      for (const room of context?.tripRooms || []) {
        if (!room?.roomId) {
          // eslint-disable-next-line no-continue
          continue;
        }

        joinTripRoom(room.roomId, {
          moveStudentFromQueue: socket.user.role === "student",
        });
      }
    } catch (_error) {
      // Ignore context preload failures for socket startup.
    }

    socket.emit("socket:ready", {
      user: {
        id: user._id.toString(),
        role: user.role,
        name: user.name,
      },
    });

    const callbackError = (callback, fallbackMessage, error) => {
      callback?.({
        ok: false,
        message: error?.message || fallbackMessage,
      });
    };

    socket.on("joinQueueChat", async (_payload = {}, callback) => {
      try {
        await chatService.requireQueueChatAccess(socket.user._id);
        const joined = joinQueueRoom();
        callback?.({ ok: true, room: QUEUE_ROOM_NAME, joined });
      } catch (error) {
        callbackError(callback, "Not allowed", error);
      }
    });

    socket.on("leaveQueueChat", (_payload = {}, callback) => {
      const left = leaveQueueRoom();
      callback?.({ ok: true, left });
    });

    socket.on("queueChatMessage", async (payload = {}, callback) => {
      try {
        const content = typeof payload?.message === "string"
          ? payload.message
          : typeof payload?.content === "string"
            ? payload.content
            : "";

        const message = await chatService.sendQueueMessage(socket.user._id, content);
        joinQueueRoom();

        callback?.({ ok: true, message });
      } catch (error) {
        callbackError(callback, "Failed to send message", error);
      }
    });

    socket.on("joinTripChat", async (payload = {}, callback) => {
      try {
        const tripId = typeof payload?.tripId === "string" ? payload.tripId.trim() : "";
        if (!tripId) {
          callback?.({ ok: false, message: "tripId is required" });
          return;
        }

        const access = await chatService.requireTripChatAccess(socket.user._id, tripId);
        const result = joinTripRoom(access.roomId, {
          moveStudentFromQueue: access.actor.role === "student",
        });

        callback?.({
          ok: true,
          room: result.room,
          joined: result.joined,
          tripId: access.tripId,
          rideId: access.rideId,
        });
      } catch (error) {
        callbackError(callback, "Not allowed", error);
      }
    });

    socket.on("leaveTripChat", (payload = {}, callback) => {
      const rideId = typeof payload?.rideId === "string" ? payload.rideId.trim() : "";

      if (!rideId) {
        leaveAllTripRooms();
        callback?.({ ok: true, leftAll: true });
        return;
      }

      const left = leaveTripRoom(rideId);
      callback?.({ ok: true, left });
    });

    socket.on("tripChatMessage", async (payload = {}, callback) => {
      try {
        const tripId = typeof payload?.tripId === "string" ? payload.tripId.trim() : "";
        if (!tripId) {
          callback?.({ ok: false, message: "tripId is required" });
          return;
        }

        const content = typeof payload?.message === "string"
          ? payload.message
          : typeof payload?.content === "string"
            ? payload.content
            : "";

        const access = await chatService.requireTripChatAccess(socket.user._id, tripId);
        joinTripRoom(access.roomId, {
          moveStudentFromQueue: access.actor.role === "student",
        });

        const message = await chatService.sendTripMessage(socket.user._id, access.rideId, content);
        callback?.({ ok: true, message });
      } catch (error) {
        callbackError(callback, "Failed to send message", error);
      }
    });

    socket.on("disconnecting", () => {
      leaveQueueRoom();
      leaveAllTripRooms();
    });

    socket.on("disconnect", () => {
      const managedEvents = [
        "joinQueueChat",
        "leaveQueueChat",
        "queueChatMessage",
        "joinTripChat",
        "leaveTripChat",
        "tripChatMessage",
      ];

      for (const eventName of managedEvents) {
        socket.removeAllListeners(eventName);
      }

      leaveAllTripRooms();
      socket.data.tripRooms = new Set();
      socket.data.joinedQueueRoom = false;
    });
  });

  setIO(io);
  return io;
};

module.exports = initSocketServer;
