const { Server } = require("socket.io");
const User = require("../models/User");
const { verifyToken } = require("../utils/jwt");
const env = require("../config/env");
const { setIO } = require("../config/socket");
const chatService = require("../services/chatService");

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
      if (!user) {
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

    socket.join(`user:${user._id.toString()}`);
    socket.join(`role:${user.role}`);

    const chatContext = await chatService.getCurrentChatContext(user);
    if (chatContext?.rideId) {
      socket.join(`ride:${chatContext.rideId}`);
    }

    socket.emit("socket:ready", {
      user: {
        id: user._id.toString(),
        role: user.role,
        name: user.name,
      },
    });

    socket.on("chat:join", async ({ rideId }, callback) => {
      try {
        const hasAccess = await chatService.canAccessRide(user, rideId);
        if (!hasAccess) {
          throw new Error("Not allowed");
        }

        socket.join(`ride:${rideId}`);
        callback?.({ ok: true });
      } catch (error) {
        callback?.({ ok: false, message: error.message || "Unable to join room" });
      }
    });

    socket.on("chat:send", async ({ rideId, content }, callback) => {
      try {
        if (!content || !content.trim()) {
          throw new Error("Message content is required");
        }

        const message = await chatService.sendRideMessage(user, rideId, content.trim());
        callback?.({ ok: true, message });
      } catch (error) {
        callback?.({ ok: false, message: error.message || "Failed to send message" });
      }
    });
  });

  setIO(io);
  return io;
};

module.exports = initSocketServer;
