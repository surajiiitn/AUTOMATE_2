const mongoose = require("mongoose");

const MessageSchema = new mongoose.Schema(
  {
    ride: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Ride",
      required: true,
      index: true,
    },
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    content: {
      type: String,
      required: true,
      trim: true,
      maxlength: 1000,
    },
  },
  { timestamps: true },
);

module.exports = mongoose.model("Message", MessageSchema);
