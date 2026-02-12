const mongoose = require("mongoose");
const env = require("./env");

const connectDB = async () => {
  mongoose.set("strictQuery", true);
  await mongoose.connect(env.mongoUri);
  // eslint-disable-next-line no-console
  console.log(`MongoDB connected: ${mongoose.connection.host}`);
};

module.exports = connectDB;
