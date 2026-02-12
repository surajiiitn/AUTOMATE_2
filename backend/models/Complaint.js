const mongoose = require("mongoose");

const COMPLAINT_STATUSES = ["submitted", "in_review", "resolved", "rejected"];

const ComplaintSchema = new mongoose.Schema(
  {
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    trip: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Trip",
      default: null,
      index: true,
    },
    ride: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Ride",
      default: null,
    },
    complaintText: {
      type: String,
      required: true,
      trim: true,
      maxlength: 2000,
    },
    description: {
      type: String,
      trim: true,
      default: "",
    },
    status: {
      type: String,
      enum: COMPLAINT_STATUSES,
      default: "submitted",
      index: true,
    },
    adminResponse: {
      type: String,
      trim: true,
      default: "",
    },
    adminRemark: {
      type: String,
      trim: true,
      default: "",
    },
    resolvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true },
);

const Complaint = mongoose.model("Complaint", ComplaintSchema);

module.exports = Complaint;
module.exports.COMPLAINT_STATUSES = COMPLAINT_STATUSES;
