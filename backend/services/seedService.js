const User = require("../models/User");
const env = require("../config/env");

const ensureUser = async ({ name, email, password }, role) => {
  if (!email || !password || !name) {
    return;
  }

  const existing = await User.findOne({ email: email.toLowerCase() });
  if (existing) {
    return;
  }

  await User.create({
    name,
    email,
    password,
    role,
    status: "active",
  });
};

const seedDefaultUsers = async () => {
  await ensureUser(env.seed.admin, "admin");
  await ensureUser(env.seed.driver, "driver");
  await ensureUser(env.seed.student, "student");
};

module.exports = { seedDefaultUsers };
