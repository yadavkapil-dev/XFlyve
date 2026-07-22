const { Server } = require("socket.io");
const { verifyAuthToken } = require("../middlewares/authMiddleware");
const logger = require("../utils/logger");

let io = null;

const buildCorsOptions = () => {
  const allowedOrigins = (process.env.CORS_WHITELIST || process.env.FRONTEND_URL || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  return {
    origin: (origin, callback) => {
      if (!origin) return callback(null, true); // non-browser clients (tests, tools)
      if (!allowedOrigins.includes(origin)) {
        logger.warn(`Socket.IO CORS blocked: ${origin}`);
        return callback(new Error("CORS policy does not allow access from this origin."));
      }
      return callback(null, true);
    },
    credentials: true,
  };
};

/**
 * Authenticates a socket handshake using the exact same JWT verification
 * (and active-account check) as the REST authMiddleware — no separate auth
 * logic to keep in sync. Exported standalone so it can be unit-tested
 * directly with a fake socket, without a real network connection.
 */
const authenticateSocket = async (socket, next) => {
  try {
    const token = socket.handshake?.auth?.token;
    if (!token) {
      return next(new Error("Authentication required"));
    }

    const { user, active } = await verifyAuthToken(token);
    if (!active) {
      return next(new Error("Account is inactive or no longer available"));
    }

    socket.user = user;
    next();
  } catch (err) {
    next(new Error("Invalid or expired token"));
  }
};

/**
 * Joins each authenticated socket to exactly one room, keyed by its own
 * verified user id. The room name is derived only from `socket.user`
 * (set by authenticateSocket from the verified JWT) — there is no event
 * handler anywhere that accepts a room or user id from the client, so a
 * socket can never join or receive another user's room. Exported
 * standalone for the same testability reason as authenticateSocket.
 */
const handleConnection = (socket) => {
  socket.join(`user:${socket.user.id}`);
};

/**
 * Attaches Socket.IO to the given HTTP server. Called exactly once at
 * server startup, so the connection listener is registered exactly once —
 * no duplicate listeners across reconnects (each client reconnect is a new
 * socket instance handled by the same single `io.on("connection", ...)`).
 */
const initSocket = (httpServer) => {
  io = new Server(httpServer, {
    cors: buildCorsOptions(),
  });

  io.use(authenticateSocket);
  io.on("connection", handleConnection);

  return io;
};

const getIO = () => io;

/**
 * Emits `event` with `payload` to a single user's room, if a socket layer
 * is active and the user is currently connected. No-ops otherwise (e.g. in
 * tests, or when the recipient is offline) — REST remains the source of
 * truth for anything missed while offline.
 */
const emitToUser = (userId, event, payload) => {
  if (!io || !userId) return;
  io.to(`user:${userId}`).emit(event, payload);
};

module.exports = {
  initSocket,
  getIO,
  emitToUser,
  authenticateSocket,
  handleConnection,
};
