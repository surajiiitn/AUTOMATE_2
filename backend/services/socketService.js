const { getIO } = require("../config/socket");

const QUEUE_ROOM_NAME = "queue_room";
const getTripRoomName = (rideId) => `trip_room:${rideId}`;

const toUserRooms = (userIds) => (
  [...new Set((userIds || []).filter(Boolean).map((userId) => `user:${userId}`))]
);

const withIO = (callback) => {
  const io = getIO();
  if (!io) {
    return null;
  }

  return callback(io);
};

const emitToAll = (event, payload) => {
  withIO((io) => io.emit(event, payload));
};

const emitToRole = (role, event, payload) => {
  withIO((io) => io.to(`role:${role}`).emit(event, payload));
};

const emitToUser = (userId, event, payload) => {
  withIO((io) => io.to(`user:${userId}`).emit(event, payload));
};

const emitToQueueRoom = (event, payload) => {
  withIO((io) => io.to(QUEUE_ROOM_NAME).emit(event, payload));
};

const emitToRide = (rideId, event, payload) => {
  withIO((io) => io.to(getTripRoomName(rideId)).emit(event, payload));
};

const addUsersToQueueRoom = async (userIds) => {
  const uniqueUserRooms = toUserRooms(userIds);
  if (uniqueUserRooms.length === 0) {
    return;
  }

  await withIO((io) => io.in(uniqueUserRooms).socketsJoin(QUEUE_ROOM_NAME));
};

const removeUsersFromQueueRoom = async (userIds) => {
  const uniqueUserRooms = toUserRooms(userIds);
  if (uniqueUserRooms.length === 0) {
    return;
  }

  await withIO((io) => io.in(uniqueUserRooms).socketsLeave(QUEUE_ROOM_NAME));
};

const addUsersToTripRoom = async (userIds, rideId) => {
  const uniqueUserRooms = toUserRooms(userIds);
  if (uniqueUserRooms.length === 0 || !rideId) {
    return;
  }

  await withIO(async (io) => {
    // Selected users should leave queue chat once moved into an active trip room.
    await io.in(uniqueUserRooms).socketsLeave(QUEUE_ROOM_NAME);
    await io.in(uniqueUserRooms).socketsJoin(getTripRoomName(rideId));

    // Drivers stay available in queue chat.
    await io.in("role:driver").socketsJoin(QUEUE_ROOM_NAME);
  });
};

const removeUsersFromTripRoom = async (userIds, rideId) => {
  const uniqueUserRooms = toUserRooms(userIds);
  if (uniqueUserRooms.length === 0 || !rideId) {
    return;
  }

  await withIO((io) => io.in(uniqueUserRooms).socketsLeave(getTripRoomName(rideId)));
};

module.exports = {
  QUEUE_ROOM_NAME,
  getTripRoomName,
  emitToAll,
  emitToRole,
  emitToUser,
  emitToQueueRoom,
  emitToRide,
  addUsersToQueueRoom,
  removeUsersFromQueueRoom,
  addUsersToTripRoom,
  removeUsersFromTripRoom,
};
