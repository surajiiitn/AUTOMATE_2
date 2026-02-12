const User = require("../models/User");
const asyncHandler = require("../utils/asyncHandler");
const { success } = require("../utils/response");
const ApiError = require("../utils/ApiError");

const toSafeUser = (user) => ({
  id: user._id.toString(),
  name: user.name,
  email: user.email,
  role: user.role,
  status: user.status,
  vehicleNumber: user.vehicleNumber,
});

const getUsers = asyncHandler(async (req, res) => {
  const { q = "", role } = req.query;

  const filter = {};
  if (role) {
    filter.role = role;
  }

  if (q) {
    filter.$or = [
      { name: { $regex: q, $options: "i" } },
      { email: { $regex: q, $options: "i" } },
    ];
  }

  const users = await User.find(filter).sort({ createdAt: -1 });

  return success(res, {
    users: users.map(toSafeUser),
  });
});

const createUser = asyncHandler(async (req, res) => {
  const { name, email, password, role, vehicleNumber } = req.body;

  const existing = await User.findOne({ email: email.toLowerCase() });
  if (existing) {
    throw new ApiError(409, "Email already exists");
  }

  const user = await User.create({
    name,
    email,
    password,
    role,
    vehicleNumber: role === "driver" ? vehicleNumber || null : null,
  });

  return success(res, { user: toSafeUser(user) }, "User created", 201);
});

module.exports = {
  getUsers,
  createUser,
};
