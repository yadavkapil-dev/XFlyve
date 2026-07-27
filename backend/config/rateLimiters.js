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

// Per-user limiter for POST /api/ai/chat — scoped to req.user.id rather
// than IP (the default), since this route is always authenticated by the
// time this runs (placed after authMiddleware in routes/aiRoutes.js) and
// the thing actually worth protecting is the shared OpenRouter free-tier
// daily quota, not any one IP address. 20/hour is generous for normal use
// while making it hard for one user to accidentally burn through the
// account's whole daily allowance in a short burst. Configurable via
// AI_CHAT_RATE_LIMIT_MAX for the same test-suite reason as apiLimiter.
//
// keyGenerator deliberately does not fall back to req.ip — express-rate-limit
// v8 throws ERR_ERL_KEY_GEN_IPV6 at construction time if a custom
// keyGenerator's source references req.ip without the ipKeyGenerator IPv6
// helper, and no fallback is needed here anyway since req.user is always
// populated by the time this middleware runs.
const aiChatLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: Number(process.env.AI_CHAT_RATE_LIMIT_MAX) || 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user.id,
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      message: "Too many assistant requests, please try again later.",
      retryAfter: 60 * 60,
    });
  },
});

module.exports = { apiLimiter, loginLimiter, aiChatLimiter };
