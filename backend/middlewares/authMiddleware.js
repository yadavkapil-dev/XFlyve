const jwt = require("jsonwebtoken");
const Driver = require("../models/driver");

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
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded.id || decoded._id || decoded.sub;

    const account = await Driver.findById(userId).select("recordStatus active");
    if (!account || account.recordStatus !== "active" || account.active === false) {
      return res.status(401).json({
        success: false,
        message: "Account is inactive or no longer available",
      });
    }

    req.user = {
      ...decoded,
      id: userId,
      _id: userId,
    };
    next();
  } catch (err) {
    return res.status(401).json({
      success: false,
      message: "Invalid or expired token",
    });
  }
};

module.exports = authMiddleware;
