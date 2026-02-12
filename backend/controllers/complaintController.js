const Complaint = require("../models/Complaint");
const asyncHandler = require("../utils/asyncHandler");
const { success } = require("../utils/response");
const ApiError = require("../utils/ApiError");
const { emitToRole } = require("../services/socketService");

const createComplaint = asyncHandler(async (req, res) => {
  const { description, rideId } = req.body;

  const complaint = await Complaint.create({
    student: req.user._id,
    description,
    ride: rideId || null,
  });

  await complaint.populate("student", "name email role");

  emitToRole("admin", "complaint:new", {
    id: complaint._id.toString(),
    student: complaint.student,
    description: complaint.description,
    status: complaint.status,
    createdAt: complaint.createdAt,
  });

  return success(res, { complaint }, "Complaint submitted", 201);
});

const getMyComplaints = asyncHandler(async (req, res) => {
  const complaints = await Complaint.find({ student: req.user._id }).sort({ createdAt: -1 });
  return success(res, { complaints });
});

const getAllComplaints = asyncHandler(async (_req, res) => {
  const complaints = await Complaint.find()
    .sort({ createdAt: -1 })
    .populate("student", "name email role")
    .populate("resolvedBy", "name email role");

  return success(res, { complaints });
});

const updateComplaintStatus = asyncHandler(async (req, res) => {
  const { complaintId } = req.params;
  const { status, adminRemark } = req.body;

  const complaint = await Complaint.findById(complaintId);
  if (!complaint) {
    throw new ApiError(404, "Complaint not found");
  }

  complaint.status = status;
  complaint.adminRemark = adminRemark || complaint.adminRemark;

  if (status === "completed") {
    complaint.resolvedBy = req.user._id;
  }

  await complaint.save();
  await complaint.populate("student", "name email role");

  return success(res, { complaint }, "Complaint updated");
});

module.exports = {
  createComplaint,
  getMyComplaints,
  getAllComplaints,
  updateComplaintStatus,
};
