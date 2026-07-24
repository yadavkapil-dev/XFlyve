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
const { apiLimiter } = require("./config/rateLimiters");
const swaggerUi = require("swagger-ui-express");
const openApiSpec = require("./docs/openapi");
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

// Render puts exactly one reverse proxy in front of this app. Trusting one
// hop means req.ip (and X-Forwarded-For parsing generally) resolves to the
// real client IP that proxy forwarded, not the proxy's own address — this
// is what the rate limiters below key off of, so without it every request
// would appear to come from the same IP.
app.set("trust proxy", 1);

// Correlation ID: accept an inbound X-Request-Id or generate one, expose it
// on the response header, and make it available to logger/error handling.
app.use(requestId);

app.use(apiLimiter);

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

// Mounted before the global helmet() below so its default Content-Security-
// Policy (script-src/style-src 'self') never applies here — Swagger UI's
// bundled assets need inline styles/scripts to render.
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(openApiSpec));

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
