const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const morgan = require("morgan");
const routes = require("./routes");
const env = require("./config/env");
const { apiLimiter } = require("./middleware/rateLimiters");
const { notFound, errorHandler } = require("./middleware/errorMiddleware");

const app = express();
app.set("trust proxy", 1);


app.use(helmet());
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || env.corsOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
  }),
);

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

if (env.nodeEnv !== "test") {
  app.use(morgan("dev"));
}

app.get("/health", (_req, res) => {
  res.json({
    success: true,
    service: "auto-mate-backend",
    status: "ok",
    timestamp: new Date().toISOString(),
  });
});

app.use("/api", apiLimiter, routes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
