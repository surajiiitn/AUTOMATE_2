const asyncHandler = require("../utils/asyncHandler");
const { success } = require("../utils/response");
const queueService = require("../services/queueService");

const bookRide = asyncHandler(async (req, res) => {
  const { pickup, destination } = req.body;
  const currentRide = await queueService.bookRide(req.user._id, pickup, destination);

  return success(res, { currentRide }, "Ride booked successfully", 201);
});

const leaveQueue = asyncHandler(async (req, res) => {
  const data = await queueService.leaveQueue(req.user._id);
  const currentRide = await queueService.getStudentCurrentRide(req.user._id);
  return success(res, { ...data, currentRide }, "Left queue successfully");
});

const getStudentCurrentRide = asyncHandler(async (req, res) => {
  const currentRide = await queueService.getStudentCurrentRide(req.user._id);
  return success(res, { currentRide });
});

const getStudentHistory = asyncHandler(async (req, res) => {
  const rides = await queueService.getStudentRideHistory(req.user._id);
  return success(res, { rides });
});

const getDriverCurrentRide = asyncHandler(async (req, res) => {
  const data = await queueService.getDriverCurrentRide(req.user._id);
  return success(res, data);
});

const markArrived = asyncHandler(async (req, res) => {
  const { queueEntryId } = req.params;
  const data = await queueService.markStudentArrived(req.user._id, queueEntryId);
  return success(res, data, "Student marked arrived");
});

const cancelStudent = asyncHandler(async (req, res) => {
  const { queueEntryId } = req.params;
  const data = await queueService.cancelStudentFromRide(req.user._id, queueEntryId);
  const message = data.cancelCount === 1
    ? "Student moved to end of queue"
    : "Student removed from queue";

  return success(res, data, message);
});

const startTrip = asyncHandler(async (req, res) => {
  const data = await queueService.startTrip(req.user._id);
  return success(res, data, "Trip started");
});

const completeTrip = asyncHandler(async (req, res) => {
  const data = await queueService.completeTrip(req.user._id);
  return success(res, data, "Trip completed");
});

const getAdminQueue = asyncHandler(async (_req, res) => {
  const data = await queueService.getAdminQueueOverview();
  return success(res, data);
});

const getAdminStats = asyncHandler(async (_req, res) => {
  const stats = await queueService.getAdminStats();
  return success(res, { stats });
});

module.exports = {
  bookRide,
  leaveQueue,
  getStudentCurrentRide,
  getStudentHistory,
  getDriverCurrentRide,
  markArrived,
  cancelStudent,
  startTrip,
  completeTrip,
  getAdminQueue,
  getAdminStats,
};
