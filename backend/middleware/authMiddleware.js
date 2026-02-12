const User = require("../models/User");
const ApiError = require("../utils/ApiError");
const { verifyToken } = require("../utils/jwt");

const authMiddleware = async (req, _res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return next(new ApiError(401, "Missing or invalid authorization token"));
    }

    const token = authHeader.split(" ")[1];
    const decoded = verifyToken(token);

    const user = await User.findById(decoded.sub).select("-password");
    if (!user) {
      return next(new ApiError(401, "Invalid token: user not found"));
    }

    if (user.isActive === false) {
      return next(new ApiError(403, "Account removed by admin"));
    }

    if (user.status !== "active") {
      return next(new ApiError(403, "User is inactive. Contact admin."));
    }

    req.user = user;
    return next();
  } catch (error) {
    return next(new ApiError(401, "Unauthorized"));
  }
};

module.exports = authMiddleware;
