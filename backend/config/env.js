const dotenv = require("dotenv");

dotenv.config();

const required = ["MONGO_URI", "JWT_SECRET"];
for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

const parseOrigins = (value) => {
  if (!value) {
    return ["http://localhost:8080", "http://localhost:5173"];
  }

  return value
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
};

module.exports = {
  nodeEnv: process.env.NODE_ENV || "development",
  port: Number(process.env.PORT) || 5000,
  mongoUri: process.env.MONGO_URI,
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "7d",
  corsOrigins: parseOrigins(process.env.CORS_ORIGIN),
  socketCorsOrigins: parseOrigins(process.env.SOCKET_CORS_ORIGIN || process.env.CORS_ORIGIN),
  rateLimitWindowMs: Number(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  rateLimitMax: Number(process.env.RATE_LIMIT_MAX) || 300,
  authRateLimitMax: Number(process.env.AUTH_RATE_LIMIT_MAX) || 20,
  seed: {
    admin: {
      name: process.env.SEED_ADMIN_NAME,
      email: process.env.SEED_ADMIN_EMAIL,
      password: process.env.SEED_ADMIN_PASSWORD,
    },
    driver: {
      name: process.env.SEED_DRIVER_NAME,
      email: process.env.SEED_DRIVER_EMAIL,
      password: process.env.SEED_DRIVER_PASSWORD,
    },
    student: {
      name: process.env.SEED_STUDENT_NAME,
      email: process.env.SEED_STUDENT_EMAIL,
      password: process.env.SEED_STUDENT_PASSWORD,
    },
  },
};
