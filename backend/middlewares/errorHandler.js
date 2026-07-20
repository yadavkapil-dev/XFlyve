/**
 * Centralized error handling middleware for Xflyve.
 * Logs errors and sends clean, structured responses.
 */

const logger = require("../utils/logger");

const errorHandler = (err, req, res, next) => {
  const statusCode = err.statusCode || 500;
  const env = process.env.NODE_ENV || "development";

  // Log error
  logger.error(err.stack || err);

  // Build response payload
  const response = {
    success: false,
    message: err.message || "Internal Server Error",
    statusCode,
    requestId: req.id,
  };

  // Include stack or raw error details only in development
  if (env === "development") {
    response.stack = err.stack;
    response.error = err;
  }

  res.status(statusCode).json(response);
};

module.exports = errorHandler;
