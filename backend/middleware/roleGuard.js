const ApiError = require("../utils/ApiError");

const roleGuard = (...allowedRoles) => (req, _res, next) => {
  if (!req.user) {
    return next(new ApiError(401, "Authentication required"));
  }

  if (!allowedRoles.includes(req.user.role)) {
    return next(new ApiError(403, "You are not authorized for this action"));
  }

  return next();
};

module.exports = roleGuard;
