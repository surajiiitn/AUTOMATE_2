const mongoose = require("mongoose");

const RideSchema = new mongoose.Schema(
  {
    driver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    students: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "QueueEntry",
      },
    ],
    status: {
      type: String,
      enum: ["forming", "ready", "in-transit", "completed", "cancelled"],
      default: "forming",
      index: true,
    },
    maxSeats: {
      type: Number,
      default: 4,
    },
    startedAt: Date,
    completedAt: Date,
  },
  { timestamps: true },
);

RideSchema.index(
  { driver: 1, status: 1 },
  {
    unique: true,
    partialFilterExpression: {
      status: "in-transit",
      driver: { $type: "objectId" },
    },
  },
);

module.exports = mongoose.model("Ride", RideSchema);
