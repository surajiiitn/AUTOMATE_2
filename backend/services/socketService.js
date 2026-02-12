const { getIO } = require("../config/socket");

const withIO = (callback) => {
  const io = getIO();
  if (!io) {
    return;
  }

  callback(io);
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

const emitToRide = (rideId, event, payload) => {
  withIO((io) => io.to(`ride:${rideId}`).emit(event, payload));
};

module.exports = {
  emitToAll,
  emitToRole,
  emitToUser,
  emitToRide,
};
