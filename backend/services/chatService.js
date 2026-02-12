const mongoose = require("mongoose");
const Message = require("../models/Message");
const Trip = require("../models/Trip");
const QueueEntry = require("../models/QueueEntry");
const User = require("../models/User");
const ApiError = require("../utils/ApiError");
const {
  QUEUE_ROOM_NAME,
  emitToQueueRoom,
  emitToRide,
  emitToRole,
  emitToUser,
} = require("./socketService");

const CHAT_ROLES = new Set(["student", "driver"]);
const ROOM_TYPES = {
  QUEUE: "queue",
  TRIP: "trip",
};

const toId = (value) => {
  if (!value) {
    return null;
  }

  if (typeof value === "string") {
    return value;
  }

  if (value._id) {
    return value._id.toString();
  }

  return value.toString();
};

const loadActiveUserFromDb = async (userOrId) => {
  const userId = toId(userOrId);
  if (!userId) {
    throw new ApiError(401, "Unauthorized");
  }

  const user = await User.findById(userId).select("_id name email role status");
  if (!user || user.status !== "active") {
    throw new ApiError(401, "Unauthorized");
  }

  return user;
};

const loadActorFromDb = async (userOrId) => {
  const actor = await loadActiveUserFromDb(userOrId);

  if (!CHAT_ROLES.has(actor.role)) {
    throw new ApiError(403, "Chat is only available for students and drivers");
  }

  return actor;
};

const validateObjectId = (value, fieldName) => {
  if (!value || !mongoose.Types.ObjectId.isValid(value)) {
    throw new ApiError(400, `Invalid ${fieldName}`);
  }
};

const toMessagePayload = (messageDoc) => {
  const senderDoc = messageDoc.senderId;
  const senderId = senderDoc?._id ? senderDoc._id.toString() : toId(messageDoc.senderId);

  return {
    id: messageDoc._id.toString(),
    roomType: messageDoc.roomType,
    roomId: messageDoc.roomId,
    content: messageDoc.message,
    sender: {
      id: senderId,
      name: senderDoc?.name || "Unknown",
      role: messageDoc.senderRole,
    },
    createdAt: messageDoc.timestamp || messageDoc.createdAt,
  };
};

const loadActiveTripByTripId = async (tripId) => {
  validateObjectId(tripId, "trip ID");

  const trip = await Trip.findOne({
    _id: tripId,
    status: "in-transit",
  }).select("_id ride driver students status");

  if (!trip) {
    throw new ApiError(403, "Chat room is not available for this trip");
  }

  return trip;
};

const loadActiveTripByRideId = async (rideId) => {
  validateObjectId(rideId, "ride ID");

  const trip = await Trip.findOne({
    ride: rideId,
    status: "in-transit",
  }).select("_id ride driver students status");

  if (!trip) {
    throw new ApiError(403, "Chat room is not available for this trip");
  }

  return trip;
};

const buildTripAccess = (actor, trip) => {
  const actorId = actor._id.toString();
  const driverId = toId(trip.driver);
  const studentIds = (trip.students || []).map((studentId) => studentId.toString());

  if (!driverId) {
    throw new ApiError(403, "Trip has no assigned driver");
  }

  if (actor.role === "driver") {
    if (driverId !== actorId) {
      throw new ApiError(403, "You are not assigned to this trip");
    }
  } else if (!studentIds.includes(actorId)) {
    throw new ApiError(403, "You are not assigned to this trip");
  }

  return {
    actor,
    trip,
    tripId: trip._id.toString(),
    rideId: trip.ride.toString(),
    // Trip room key is mapped to rideId because queue + ride updates already use ride-scoped room joins.
    roomType: ROOM_TYPES.TRIP,
    roomId: trip.ride.toString(),
    driverId,
    studentIds,
  };
};

const requireQueueChatAccess = async (userOrId) => {
  const actor = await loadActorFromDb(userOrId);

  if (actor.role === "driver") {
    return {
      actor,
      roomType: ROOM_TYPES.QUEUE,
      roomId: QUEUE_ROOM_NAME,
    };
  }

  const waitingEntry = await QueueEntry.findOne({
    student: actor._id,
    status: "waiting",
  }).select("_id student status");

  if (!waitingEntry) {
    throw new ApiError(403, "Queue chat is available only while waiting in queue");
  }

  return {
    actor,
    waitingEntry,
    roomType: ROOM_TYPES.QUEUE,
    roomId: QUEUE_ROOM_NAME,
  };
};

const requireTripChatAccess = async (userOrId, tripId) => {
  const actor = await loadActorFromDb(userOrId);
  const trip = await loadActiveTripByTripId(tripId);
  return buildTripAccess(actor, trip);
};

const requireRideChatAccess = async (userOrId, rideId) => {
  const actor = await loadActorFromDb(userOrId);
  const trip = await loadActiveTripByRideId(rideId);
  return buildTripAccess(actor, trip);
};

const canAccessRide = async (user, rideId) => {
  try {
    await requireRideChatAccess(user, rideId);
    return true;
  } catch (_error) {
    return false;
  }
};

const requireChatAccess = async (userOrId, rideId) => {
  return requireRideChatAccess(userOrId, rideId);
};

const serializeTripRoom = async (trip, actorRole) => {
  if (actorRole === "student") {
    const driver = await User.findById(trip.driver).select("_id name email role");

    return {
      roomType: ROOM_TYPES.TRIP,
      roomId: trip.ride.toString(),
      tripId: trip._id.toString(),
      rideId: trip.ride.toString(),
      label: driver?.name || "Driver",
      otherUser: driver
        ? {
            id: driver._id.toString(),
            name: driver.name,
            email: driver.email,
            role: driver.role,
          }
        : null,
    };
  }

  const studentUsers = await User.find({ _id: { $in: trip.students || [] } }).select("_id name email role");

  const primaryStudent = studentUsers[0] || null;
  const label = primaryStudent
    ? `${primaryStudent.name}${studentUsers.length > 1 ? ` +${studentUsers.length - 1}` : ""}`
    : "Trip Chat";

  return {
    roomType: ROOM_TYPES.TRIP,
    roomId: trip.ride.toString(),
    tripId: trip._id.toString(),
    rideId: trip.ride.toString(),
    label,
    students: studentUsers.map((student) => ({
      id: student._id.toString(),
      name: student.name,
      email: student.email,
      role: student.role,
    })),
    otherUser: primaryStudent
      ? {
          id: primaryStudent._id.toString(),
          name: primaryStudent.name,
          email: primaryStudent.email,
          role: primaryStudent.role,
        }
      : null,
  };
};

const getCurrentChatContext = async (userOrId) => {
  const actor = await loadActorFromDb(userOrId);

  const context = {
    queueRoom: null,
    tripRooms: [],
    defaultRoom: null,
  };

  if (actor.role === "driver") {
    context.queueRoom = {
      roomType: ROOM_TYPES.QUEUE,
      roomId: QUEUE_ROOM_NAME,
      label: "Queue Chat",
      otherUser: null,
    };

    const trips = await Trip.find({
      driver: actor._id,
      status: "in-transit",
    })
      .sort({ startedAt: -1 })
      .select("_id ride driver students startedAt");

    for (const trip of trips) {
      // eslint-disable-next-line no-await-in-loop
      const room = await serializeTripRoom(trip, actor.role);
      context.tripRooms.push(room);
    }

    context.defaultRoom = context.tripRooms[0] || context.queueRoom;
    return context;
  }

  const waitingEntry = await QueueEntry.findOne({
    student: actor._id,
    status: "waiting",
  }).select("_id");

  if (waitingEntry) {
    context.queueRoom = {
      roomType: ROOM_TYPES.QUEUE,
      roomId: QUEUE_ROOM_NAME,
      label: "Queue Chat",
      otherUser: {
        id: "driver",
        name: "Driver",
        email: "",
        role: "driver",
      },
    };
  }

  const activeTrip = await Trip.findOne({
    students: actor._id,
    status: "in-transit",
  })
    .sort({ startedAt: -1 })
    .select("_id ride driver students startedAt");

  if (activeTrip) {
    context.tripRooms = [await serializeTripRoom(activeTrip, actor.role)];
  }

  context.defaultRoom = context.tripRooms[0] || context.queueRoom;

  return context;
};

const normalizeRoom = (roomType, roomId) => {
  if (!roomType) {
    throw new ApiError(400, "roomType is required");
  }

  const normalizedType = roomType === ROOM_TYPES.TRIP ? ROOM_TYPES.TRIP : roomType === ROOM_TYPES.QUEUE ? ROOM_TYPES.QUEUE : null;

  if (!normalizedType) {
    throw new ApiError(400, "Invalid roomType");
  }

  if (normalizedType === ROOM_TYPES.QUEUE) {
    return {
      roomType: ROOM_TYPES.QUEUE,
      roomId: QUEUE_ROOM_NAME,
    };
  }

  if (!roomId) {
    throw new ApiError(400, "roomId is required for trip chat");
  }

  return {
    roomType: ROOM_TYPES.TRIP,
    roomId,
  };
};

const getRoomMessages = async (userOrId, roomType, roomId) => {
  const room = normalizeRoom(roomType, roomId);

  if (room.roomType === ROOM_TYPES.QUEUE) {
    const access = await requireQueueChatAccess(userOrId);

    const query = {
      roomType: ROOM_TYPES.QUEUE,
      roomId: QUEUE_ROOM_NAME,
    };

    if (access.actor.role === "student") {
      query.$or = [
        { senderId: access.actor._id },
        { senderRole: "driver" },
      ];
    }

    const messages = await Message.find(query)
      .sort({ timestamp: 1, createdAt: 1, _id: 1 })
      .populate("senderId", "name email role");

    return messages.map(toMessagePayload);
  }

  const access = await requireRideChatAccess(userOrId, room.roomId);

  const query = {
    roomType: ROOM_TYPES.TRIP,
    roomId: access.roomId,
  };

  if (access.actor.role === "student") {
    query.$or = [
      { senderId: access.actor._id },
      { senderId: access.driverId },
    ];
  }

  const messages = await Message.find(query)
    .sort({ timestamp: 1, createdAt: 1, _id: 1 })
    .populate("senderId", "name email role");

  return messages.map(toMessagePayload);
};

const createRoomMessage = async (access, roomType, roomId, rawContent) => {
  const content = typeof rawContent === "string" ? rawContent.trim() : "";
  if (!content) {
    throw new ApiError(400, "Message content is required");
  }

  const messageDoc = await Message.create({
    senderId: access.actor._id,
    senderRole: access.actor.role,
    roomType,
    roomId,
    message: content,
    timestamp: new Date(),
    // Legacy compatibility fields
    sender: access.actor._id,
    content,
    ride: roomType === ROOM_TYPES.TRIP ? access.rideId : null,
  });

  await messageDoc.populate("senderId", "name email role");

  return toMessagePayload(messageDoc);
};

const sendQueueMessage = async (userOrId, rawContent) => {
  const access = await requireQueueChatAccess(userOrId);
  const payload = await createRoomMessage(access, ROOM_TYPES.QUEUE, QUEUE_ROOM_NAME, rawContent);

  if (access.actor.role === "driver") {
    emitToQueueRoom("queueChatMessage", payload);
    return payload;
  }

  // Student queue messages are visible only to drivers + sender.
  emitToRole("driver", "queueChatMessage", payload);
  emitToUser(access.actor._id.toString(), "queueChatMessage", payload);

  return payload;
};

const sendTripMessage = async (userOrId, rideId, rawContent) => {
  const access = await requireRideChatAccess(userOrId, rideId);
  const payload = await createRoomMessage(access, ROOM_TYPES.TRIP, access.roomId, rawContent);

  if (access.actor.role === "driver") {
    emitToRide(access.roomId, "tripChatMessage", payload);
    return payload;
  }

  // Student trip messages are visible only to the assigned driver + sender.
  emitToUser(access.driverId, "tripChatMessage", payload);
  emitToUser(access.actor._id.toString(), "tripChatMessage", payload);

  return payload;
};

const sendMessageToRoom = async (userOrId, roomType, roomId, content) => {
  const room = normalizeRoom(roomType, roomId);

  if (room.roomType === ROOM_TYPES.QUEUE) {
    return sendQueueMessage(userOrId, content);
  }

  return sendTripMessage(userOrId, room.roomId, content);
};

const getRideMessages = async (userOrId, rideId) => {
  return getRoomMessages(userOrId, ROOM_TYPES.TRIP, rideId);
};

const sendRideMessage = async (userOrId, rideId, content) => {
  return sendTripMessage(userOrId, rideId, content);
};

module.exports = {
  ROOM_TYPES,
  QUEUE_ROOM_NAME,
  canAccessRide,
  requireChatAccess,
  requireQueueChatAccess,
  requireTripChatAccess,
  requireRideChatAccess,
  getCurrentChatContext,
  getRoomMessages,
  sendMessageToRoom,
  sendQueueMessage,
  sendTripMessage,
  getRideMessages,
  sendRideMessage,
};
