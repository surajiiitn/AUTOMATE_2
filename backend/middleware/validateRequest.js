const { validationResult } = require("express-validator");
const ApiError = require("../utils/ApiError");

const validateRequest = (req, _res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return next(new ApiError(422, "Validation failed", errors.array()));
  }

  return next();
};

module.exports = validateRequest;
