const mongoose = require("mongoose");

const MESSAGE_ROLES = ["student", "driver"];
const MESSAGE_ROOM_TYPES = ["queue", "trip"];

const MessageSchema = new mongoose.Schema(
  {
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    senderRole: {
      type: String,
      enum: MESSAGE_ROLES,
      required: true,
      index: true,
    },
    roomType: {
      type: String,
      enum: MESSAGE_ROOM_TYPES,
      required: true,
      index: true,
    },
    roomId: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    message: {
      type: String,
      required: true,
      trim: true,
      maxlength: 1000,
    },
    timestamp: {
      type: Date,
      default: Date.now,
      index: true,
    },
    // Legacy fields kept for backward compatibility with existing documents.
    ride: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Ride",
      default: null,
      index: true,
    },
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    content: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: null,
    },
  },
  { timestamps: true },
);

MessageSchema.pre("validate", function syncLegacyFields(next) {
  if (!this.sender && this.senderId) {
    this.sender = this.senderId;
  }

  if (!this.content && this.message) {
    this.content = this.message;
  }

  return next();
});

MessageSchema.index({ roomType: 1, roomId: 1, timestamp: 1, _id: 1 });

module.exports = mongoose.model("Message", MessageSchema);
