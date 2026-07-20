const crypto = require("crypto");
const { runWithRequestId } = require("../utils/requestContext");

const REQUEST_ID_HEADER = "x-request-id";
// Conservative allowlist so a client-supplied ID can't be used to inject
// unexpected characters into logs or headers.
const SAFE_ID_PATTERN = /^[a-zA-Z0-9._-]{1,100}$/;

/**
 * Accepts an inbound X-Request-Id header if present and safe, otherwise
 * generates one. Makes the ID available on req.id, in the response header,
 * and to any logger call made during this request via AsyncLocalStorage.
 */
const requestId = (req, res, next) => {
  const incoming = req.headers[REQUEST_ID_HEADER];
  const id = typeof incoming === "string" && SAFE_ID_PATTERN.test(incoming)
    ? incoming
    : crypto.randomUUID();

  req.id = id;
  res.setHeader("X-Request-Id", id);

  runWithRequestId(id, next);
};

module.exports = requestId;
