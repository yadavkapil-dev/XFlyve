require("dotenv").config();
const http = require("http");
const mongoose = require("mongoose");
const logger = require("./utils/logger");
const connectDB = require("./config/db");
const validateEnv = require("./config/validateEnv");
const { initSocket, getIO } = require("./sockets/socketServer");

// Fail fast with a clear, safe (non-secret) message if required config is missing.
validateEnv(logger);

const app = require("./app");

// Start server
const PORT = process.env.PORT || 3001;
let serverInstance;

// Socket.IO needs the underlying http.Server (not just the Express app) so
// it can upgrade connections on the same port as the REST API.
const httpServer = http.createServer(app);
initSocket(httpServer);

connectDB()
  .then(() => {
    logger.info(`MongoDB connected`);
    logger.info(`Server running on port ${PORT} in ${process.env.NODE_ENV || "development"} mode`);
    serverInstance = httpServer.listen(PORT);
  })
  .catch(err => {
    logger.error("MongoDB connection failed: %o", err.message);
    process.exit(1);
  });

// Graceful shutdown — a single handler that closes the Socket.IO server
// (which in turn closes the underlying HTTP server it was attached to),
// then the MongoDB connection, then exits. Guarded with `isShuttingDown` so
// that if SIGINT is delivered more than once (e.g. once from the terminal's
// process-group signal and again via a wrapper like npm/nodemon forwarding
// it to this child process), the log line and teardown only ever run once
// instead of repeating mid-shutdown.
let isShuttingDown = false;

process.on("SIGINT", () => {
  if (isShuttingDown) return;
  isShuttingDown = true;

  logger.info("SIGINT received, closing server...");

  (async () => {
    const io = getIO();
    if (io) {
      await io.close().catch((err) => logger.error("Error closing Socket.IO server: %o", err));
    } else if (serverInstance) {
      await new Promise((resolve) => serverInstance.close(resolve));
    }

    try {
      await mongoose.connection.close();
    } catch (err) {
      logger.error("Error closing MongoDB connection: %o", err);
    }

    logger.info("Server closed");
    process.exit(0);
  })();
});
