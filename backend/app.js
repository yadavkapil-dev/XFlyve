// Express app definition only — no DB connection, no http.Server/Socket.IO
// attachment, no .listen(), no process-level bootstrap. Split out from
// server.js so integration tests can mount the exact real middleware/route
// stack via supertest without pulling in server.js's side effects
// (connectDB(), Socket.IO init, port binding, SIGINT handlers). server.js
// requires this module and does all of that runtime wiring around it.
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const morgan = require("morgan");
const helmet = require("helmet");
const compression = require("compression");
const rateLimit = require("express-rate-limit");
const logger = require("./utils/logger");
const { Sentry, isSentryEnabled } = require("./config/sentry");
const requestId = require("./middlewares/requestId");
const errorHandler = require("./middlewares/errorHandler");

// Routes
const authRoutes = require("./routes/authRoutes");
const jobRoutes = require("./routes/jobRoutes");
const workLogRoutes = require("./routes/workLogRoutes");
const truckRoutes = require("./routes/truckRoutes");
const truckAssignRoutes = require("./routes/truckAssignRoutes");
const jobPodRoutes = require("./routes/jobPodRoutes");
const adminRoutes = require("./routes/adminRoutes");
const workDiaryRoutes = require("./routes/workDiaryRoutes");
const notificationRoutes = require("./routes/notificationRoutes");
const activityRoutes = require("./routes/activityRoutes");

const app = express();
app.disable("x-powered-by");

// Correlation ID: accept an inbound X-Request-Id or generate one, expose it
// on the response header, and make it available to logger/error handling.
app.use(requestId);

// Rate limiter. `max` is configurable via RATE_LIMIT_MAX purely so
// integration tests (which can send well over 100 requests across a single
// suite run) don't trip the same limit real traffic would — the default
// (unset) behavior is byte-for-byte what production already had.
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: Number(process.env.RATE_LIMIT_MAX) || 100,
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      message: "Too many requests, please try again later.",
      retryAfter: 15 * 60,
    });
  },
});

app.use(limiter);

// CORS
const allowedOrigins = (process.env.CORS_WHITELIST || process.env.FRONTEND_URL || "")
  .split(",")
  .map(origin => origin.trim());

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin) return callback(null, true); // Allow Postman, curl
      if (!allowedOrigins.includes(origin)) {
        logger.warn(`CORS blocked: ${origin}`);
        return callback(new Error("CORS policy does not allow access from this origin."), false);
      }
      return callback(null, true);
    },
    credentials: true,
  })
);

app.use(helmet());
app.use(morgan("dev"));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(compression());

// Serve uploads
app.use(
  "/uploads",
  express.static("uploads", {
    setHeaders: res => {
      res.setHeader("Cache-Control", "public, max-age=3600");
    },
  })
);

// Health check
app.get("/test", (req, res) => {
  res.send("Xflyve Backend Working");
});

// Production health check: reports app availability and MongoDB
// connectivity only. No secrets or internal detail beyond that.
app.get("/healthz", (req, res) => {
  const dbConnected = mongoose.connection.readyState === 1;

  res.status(dbConnected ? 200 : 503).json({
    status: dbConnected ? "ok" : "degraded",
    uptime: process.uptime(),
    database: dbConnected ? "connected" : "disconnected",
  });
});

// API Routes
app.use("/api/auth", authRoutes);
app.use("/api/jobs", jobRoutes);
app.use("/api/worklogs", workLogRoutes);
app.use("/api/admin/trucks", truckRoutes);
app.use("/api/admin/truck-assignments", truckAssignRoutes);
app.use("/api/jobpods", jobPodRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/workdiaries", workDiaryRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/activities", activityRoutes);

app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "Xflyve backend API is running 🚀",
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ success: false, message: "Route not found" });
});

// Reports uncaught errors to Sentry (no-op when SENTRY_DSN isn't set) before
// they reach the central error handler below.
if (isSentryEnabled) {
  Sentry.setupExpressErrorHandler(app);
}

// Central error handler (logs via the shared logger, which also forwards
// error-level entries to Sentry when configured).
app.use(errorHandler);

module.exports = app;
