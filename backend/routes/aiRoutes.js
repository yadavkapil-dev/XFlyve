const express = require("express");
const router = express.Router();

const authMiddleware = require("../middlewares/authMiddleware");
const { aiChatLimiter } = require("../config/rateLimiters");
const aiController = require("../controllers/aiController");

// Same auth pattern as every other route in this app — no unauthenticated
// AI access. Role-scoping of individual tools happens inside the AI
// service/tool layer, not here (a driver and an admin hit the same route,
// each just sees a different set of available tools).
router.use(authMiddleware);

// aiChatLimiter runs after authMiddleware (req.user is required to key by
// user id) — protects the shared OpenRouter daily quota from one user's
// runaway usage, on top of the general per-IP apiLimiter already applied
// globally in app.js.
router.post("/chat", aiChatLimiter, aiController.chat);

module.exports = router;
