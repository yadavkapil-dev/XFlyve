const jwt = require("jsonwebtoken");
const Driver = require("../models/driver");

/**
 * Verifies a raw JWT and checks the account is still active. Shared by the
 * REST authMiddleware below and the Socket.IO connection handshake (see
 * sockets/socketServer.js) so both entry points use the exact same
 * verification logic instead of two copies that could drift.
 *
 * Throws for an invalid/expired token (let jwt.verify's error propagate).
 * Returns `{ user, active: false }` (does NOT throw) when the token is
 * valid but the account is inactive/archived/deleted — callers decide how
 * to report that case, since REST and sockets word it differently.
 */
const verifyAuthToken = async (token) => {
  const decoded = jwt.verify(token, process.env.JWT_SECRET);
  const userId = decoded.id || decoded._id || decoded.sub;

  const account = await Driver.findById(userId).select("recordStatus active");
  const active = Boolean(account) && account.recordStatus === "active" && account.active !== false;

  return {
    user: { ...decoded, id: userId, _id: userId },
    active,
  };
};

/**
 * Middleware to verify JWT token from Authorization header.
 * Attaches decoded user info to req.user.
 * Returns 401 if token missing/invalid, or if the account is no longer active.
 */
const authMiddleware = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({
      success: false,
      message: "Authorization token missing or invalid",
    });
  }

  const token = authHeader.split(" ")[1];

  try {
    const { user, active } = await verifyAuthToken(token);
    if (!active) {
      return res.status(401).json({
        success: false,
        message: "Account is inactive or no longer available",
      });
    }

    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({
      success: false,
      message: "Invalid or expired token",
    });
  }
};

module.exports = authMiddleware;
module.exports.verifyAuthToken = verifyAuthToken;
