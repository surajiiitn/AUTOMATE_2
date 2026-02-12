const Complaint = require("../models/Complaint");
const asyncHandler = require("../utils/asyncHandler");
const { success } = require("../utils/response");
const ApiError = require("../utils/ApiError");
const { emitToRole, emitToUser } = require("../services/socketService");

const LEGACY_STATUS_MAP = {
  waiting: "submitted",
  assigned: "in_review",
  completed: "resolved",
};

const normalizeStatus = (status) => {
  if (!status) {
    return "submitted";
  }

  return LEGACY_STATUS_MAP[status] || status;
};

const serializeComplaint = (complaint) => {
  const complaintText = complaint.complaintText || complaint.description || "";
  const adminResponse = complaint.adminResponse || complaint.adminRemark || "";
  const student = complaint.student || null;
  const resolvedBy = complaint.resolvedBy || null;

  return {
    _id: complaint._id.toString(),
    student,
    resolvedBy,
    tripId: complaint.trip ? complaint.trip.toString() : null,
    rideId: complaint.ride ? complaint.ride.toString() : null,
    complaintText,
    description: complaintText,
    status: normalizeStatus(complaint.status),
    adminResponse,
    adminRemark: adminResponse,
    createdAt: complaint.createdAt,
    updatedAt: complaint.updatedAt,
  };
};

const createComplaint = asyncHandler(async (req, res) => {
  const complaintText = `${req.body.complaintText || req.body.description || ""}`.trim();
  const { rideId, tripId } = req.body;

  if (!complaintText) {
    throw new ApiError(400, "Complaint text is required");
  }

  const complaint = await Complaint.create({
    student: req.user._id,
    complaintText,
    description: complaintText,
    trip: tripId || null,
    ride: rideId || null,
    status: "submitted",
  });

  await complaint.populate("student", "name email role");
  const payload = serializeComplaint(complaint);

  emitToRole("admin", "complaint:new", payload);

  return success(res, { complaint: payload }, "Complaint submitted", 201);
});

const getMyComplaints = asyncHandler(async (req, res) => {
  const complaints = await Complaint.find({ student: req.user._id }).sort({ createdAt: -1 });
  return success(res, { complaints: complaints.map((complaint) => serializeComplaint(complaint)) });
});

const getAllComplaints = asyncHandler(async (_req, res) => {
  const complaints = await Complaint.find()
    .sort({ createdAt: -1 })
    .populate("student", "name email role")
    .populate("resolvedBy", "name email role");

  return success(res, { complaints: complaints.map((complaint) => serializeComplaint(complaint)) });
});

const updateComplaintStatus = asyncHandler(async (req, res) => {
  const { complaintId } = req.params;
  const { status, adminResponse, adminRemark } = req.body;
  const nextStatus = status || null;
  const nextResponse =
    typeof adminResponse === "string"
      ? adminResponse.trim()
      : typeof adminRemark === "string"
        ? adminRemark.trim()
        : null;

  if (!nextStatus && nextResponse === null) {
    throw new ApiError(400, "Status or admin response is required");
  }

  const complaint = await Complaint.findById(complaintId).populate("student", "name email role");
  if (!complaint) {
    throw new ApiError(404, "Complaint not found");
  }

  complaint.status = nextStatus || normalizeStatus(complaint.status);
  if (nextResponse !== null) {
    complaint.adminResponse = nextResponse;
    complaint.adminRemark = nextResponse;
  }

  if (complaint.status === "resolved") {
    complaint.resolvedBy = req.user._id;
  } else if (nextStatus) {
    complaint.resolvedBy = null;
  }

  await complaint.save();
  await complaint.populate("resolvedBy", "name email role");
  const payload = serializeComplaint(complaint);

  const studentId = complaint.student?._id?.toString() || complaint.student?.toString();
  if (studentId) {
    emitToUser(studentId, "complaint:statusUpdated", {
      complaint: payload,
    });
  }

  emitToRole("admin", "complaint:statusUpdated", {
    complaint: payload,
  });

  return success(res, { complaint: payload }, "Complaint updated");
});

module.exports = {
  createComplaint,
  getMyComplaints,
  getAllComplaints,
  updateComplaintStatus,
};
