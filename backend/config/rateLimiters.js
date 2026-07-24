const rateLimit = require("express-rate-limit");

// General API limiter — applied globally in app.js. `max` is configurable
// via RATE_LIMIT_MAX purely so integration tests (which send well over 100
// requests across a single suite run) don't trip the same limit real
// traffic would — the default (unset) behavior is unchanged from before.
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: Number(process.env.RATE_LIMIT_MAX) || 100,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      message: "Too many requests, please try again later.",
      retryAfter: 15 * 60,
    });
  },
});

// Stricter limiter for the login route specifically — brute-force /
// credential-stuffing protection independent of (and in addition to) the
// general API limit above. Configurable via LOGIN_RATE_LIMIT_MAX for the
// same test-suite reason as apiLimiter.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: Number(process.env.LOGIN_RATE_LIMIT_MAX) || 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      message: "Too many login attempts, please try again later.",
      retryAfter: 15 * 60,
    });
  },
});

module.exports = { apiLimiter, loginLimiter };
