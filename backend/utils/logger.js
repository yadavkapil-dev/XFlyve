const fs = require("fs");
const path = require("path");
const { createLogger, transports, format } = require("winston");
const { getRequestId } = require("./requestContext");
const { Sentry, isSentryEnabled } = require("../config/sentry");

const logDir = path.resolve("logs");
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir);
}

// Attaches the current request's correlation ID (if any) to every log entry.
const addRequestId = format((info) => {
  const requestId = getRequestId();
  if (requestId) info.requestId = requestId;
  return info;
});

const logger = createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: format.combine(
    addRequestId(),
    format.timestamp(),
    format.errors({ stack: true }),
    format.splat(),
    format.json()
  ),
  defaultMeta: { service: "xflyve-backend" },
  transports: [
    new transports.File({ filename: path.join(logDir, "error.log"), level: "error" }),
    new transports.File({ filename: path.join(logDir, "combined.log") }),
  ],
});

if (process.env.NODE_ENV !== "production") {
  logger.add(
    new transports.Console({
      format: format.combine(format.colorize(), format.simple()),
    })
  );
}

// Forward error-level logs to Sentry (a no-op when SENTRY_DSN isn't set),
// reusing the existing logger call sites instead of adding capture calls
// throughout every controller.
if (isSentryEnabled) {
  const emitError = logger.error.bind(logger);
  logger.error = (...args) => {
    const err = args.find((arg) => arg instanceof Error);
    if (err) {
      Sentry.captureException(err);
    } else {
      Sentry.captureMessage(String(args[0]), "error");
    }
    return emitError(...args);
  };
}

module.exports = logger;
