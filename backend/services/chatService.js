const Message = require("../models/Message");
const Ride = require("../models/Ride");
const QueueEntry = require("../models/QueueEntry");
const ApiError = require("../utils/ApiError");
const { emitToRide, emitToUser } = require("./socketService");

const GLOBAL_CHAT_RIDE_ID = "00000000000000000000cafe";

const isGlobalChatRide = (rideId) => {
  return Boolean(rideId) && rideId.toString() === GLOBAL_CHAT_RIDE_ID;
};

const getOrCreateGlobalChatRide = async () => {
  const ride = await Ride.findByIdAndUpdate(
    GLOBAL_CHAT_RIDE_ID,
    {
      $setOnInsert: {
        status: "cancelled",
        maxSeats: 0,
        students: [],
        driver: null,
      },
    },
    {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
    },
  );

  return ride;
};

const canAccessRide = async (user, rideId) => {
  if (isGlobalChatRide(rideId)) {
    return true;
  }

  if (user.role === "admin") {
    return true;
  }

  if (user.role === "driver") {
    const ride = await Ride.findOne({ _id: rideId, driver: user._id });
    return Boolean(ride);
  }

  const queueEntry = await QueueEntry.findOne({
    ride: rideId,
    student: user._id,
  });

  return Boolean(queueEntry);
};

const getCurrentChatContext = async (_user) => {
  const globalRide = await getOrCreateGlobalChatRide();
  return {
    rideId: globalRide._id.toString(),
    isGlobal: true,
    otherUser: null,
  };
};

const getRideMessages = async (user, rideId) => {
  const hasAccess = await canAccessRide(user, rideId);
  if (!hasAccess) {
    throw new ApiError(403, "You are not allowed to access this chat room");
  }

  const messages = await Message.find({ ride: rideId })
    .sort({ createdAt: 1 })
    .populate("sender", "name email role");

  return messages.map((message) => ({
    id: message._id.toString(),
    rideId: message.ride.toString(),
    content: message.content,
    sender: {
      id: message.sender._id.toString(),
      name: message.sender.name,
      role: message.sender.role,
    },
    createdAt: message.createdAt,
  }));
};

const sendRideMessage = async (user, rideId, content) => {
  const hasAccess = await canAccessRide(user, rideId);
  if (!hasAccess) {
    throw new ApiError(403, "You are not allowed to send messages in this ride");
  }

  const message = await Message.create({
    ride: rideId,
    sender: user._id,
    content,
  });

  await message.populate("sender", "name email role");

  const payload = {
    id: message._id.toString(),
    rideId,
    content: message.content,
    sender: {
      id: message.sender._id.toString(),
      name: message.sender.name,
      role: message.sender.role,
    },
    createdAt: message.createdAt,
  };

  emitToRide(rideId, "chat:message", payload);

  if (isGlobalChatRide(rideId)) {
    return payload;
  }

  const ride = await Ride.findById(rideId).populate({
    path: "students",
    populate: { path: "student", select: "_id" },
  });

  if (ride?.driver) {
    emitToUser(ride.driver.toString(), "chat:message", payload);
  }

  for (const entry of ride?.students || []) {
    if (entry.student?._id) {
      emitToUser(entry.student._id.toString(), "chat:message", payload);
    }
  }

  return payload;
};

module.exports = {
  canAccessRide,
  getCurrentChatContext,
  getRideMessages,
  sendRideMessage,
};
