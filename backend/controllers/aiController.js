const { runChat } = require("../services/ai/aiService");
const logger = require("../utils/logger");

// @desc    Chat with the AI operations assistant
// @route   POST /api/ai/chat
// @access  Any authenticated user (driver or admin) — authMiddleware only,
//          same as the route itself; role-scoping happens per-tool inside
//          aiService/tools, not here.
exports.chat = async (req, res) => {
  const { message } = req.body;

  if (typeof message !== "string" || !message.trim()) {
    return res.status(400).json({ status: "fail", message: "message is required" });
  }

  try {
    const { reply } = await runChat({ user: req.user, message: message.trim() });
    return res.status(200).json({ status: "success", data: { reply } });
  } catch (err) {
    // runChat() already catches provider/tool failures internally and
    // resolves a graceful reply — this is a last-resort backstop for
    // anything truly unexpected, so the AI feature can never 500 the app.
    logger.error("AI chat controller error: %o", err);
    return res.status(200).json({
      status: "success",
      data: { reply: "I'm having trouble right now. Please try again shortly." },
    });
  }
};

