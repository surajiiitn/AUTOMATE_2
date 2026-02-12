const mongoose = require("mongoose");

const TripSchema = new mongoose.Schema(
  {
    ride: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Ride",
      required: true,
      unique: true,
    },
    driver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    students: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    pickupPoints: [String],
    destinations: [String],
    status: {
      type: String,
      enum: ["in-transit", "completed", "cancelled"],
      default: "in-transit",
    },
    startedAt: {
      type: Date,
      default: Date.now,
    },
    completedAt: Date,
  },
  { timestamps: true },
);

module.exports = mongoose.model("Trip", TripSchema);
