const mongoose = require("mongoose");

const QueueEntrySchema = new mongoose.Schema(
  {
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    pickup: {
      type: String,
      required: true,
      trim: true,
    },
    destination: {
      type: String,
      required: true,
      trim: true,
    },
    status: {
      type: String,
      enum: ["waiting", "assigned", "pickup", "in-transit", "completed", "cancelled", "removed"],
      default: "waiting",
      index: true,
    },
    cancelCount: {
      type: Number,
      default: 0,
    },
    queueAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    ride: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Ride",
      default: null,
    },
    driver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    arrivedAt: Date,
    startedAt: Date,
    completedAt: Date,
  },
  { timestamps: true },
);

QueueEntrySchema.index(
  { student: 1 },
  {
    unique: true,
    partialFilterExpression: {
      status: { $in: ["waiting", "assigned", "pickup", "in-transit"] },
    },
  },
);

module.exports = mongoose.model("QueueEntry", QueueEntrySchema);
