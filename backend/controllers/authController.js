const User = require("../models/User");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");
const { signToken } = require("../utils/jwt");
const { success } = require("../utils/response");

const toSafeUser = (user) => ({
  id: user._id.toString(),
  name: user.name,
  email: user.email,
  role: user.role,
  status: user.status,
  vehicleNumber: user.vehicleNumber,
});

const signup = asyncHandler(async (req, res) => {
  const { name, email, password, role, vehicleNumber } = req.body;

  const existingUser = await User.findOne({ email: email.toLowerCase() });
  if (existingUser) {
    throw new ApiError(409, "Email already registered");
  }

  const user = await User.create({
    name,
    email,
    password,
    role,
    vehicleNumber: role === "driver" ? vehicleNumber || null : null,
  });

  const token = signToken({ sub: user._id.toString(), role: user.role });

  return success(
    res,
    {
      token,
      user: toSafeUser(user),
    },
    "Signup successful",
    201,
  );
});

const login = asyncHandler(async (req, res) => {
  const { email, password, role } = req.body;

  const user = await User.findOne({ email: email.toLowerCase() }).select("+password");
  if (!user) {
    throw new ApiError(401, "Invalid email or password");
  }

  const isPasswordValid = await user.comparePassword(password);
  if (!isPasswordValid) {
    throw new ApiError(401, "Invalid email or password");
  }

  if (role && user.role !== role) {
    throw new ApiError(403, "Selected role does not match this account");
  }

  if (user.status !== "active") {
    throw new ApiError(403, "User is inactive. Contact admin.");
  }

  const token = signToken({ sub: user._id.toString(), role: user.role });

  return success(res, {
    token,
    user: toSafeUser(user),
  }, "Login successful");
});

const me = asyncHandler(async (req, res) => {
  return success(res, {
    user: toSafeUser(req.user),
  });
});

module.exports = {
  signup,
  login,
  me,
};
