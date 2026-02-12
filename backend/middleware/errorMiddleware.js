const ApiError = require("../utils/ApiError");

const notFound = (req, _res, next) => {
  next(new ApiError(404, `Route not found: ${req.originalUrl}`));
};

const errorHandler = (err, _req, res, _next) => {
  const statusCode = err.statusCode || 500;
  const response = {
    success: false,
    message: err.message || "Internal server error",
  };

  if (err.details) {
    response.details = err.details;
  }

  if (process.env.NODE_ENV !== "production") {
    response.stack = err.stack;
  }

  res.status(statusCode).json(response);
};

module.exports = { notFound, errorHandler };
