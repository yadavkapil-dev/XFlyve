const { Resend } = require("resend");
const logger = require("../utils/logger");

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

// onboarding@resend.dev is Resend's built-in sandbox sender — works with no
// domain verification, fine until a real verified sending domain is set up.
const FROM_ADDRESS = process.env.RESEND_FROM_EMAIL || "XFlyve <onboarding@resend.dev>";

// Deliberately not async/awaited by callers: a forgot-password response
// must not hang on a slow or down email provider. Resolution/failure is
// logged here, never thrown back to the request that triggered it. Never
// logs the reset URL or token — only that a send was attempted/failed.
const sendPasswordResetEmail = (to, resetUrl) => {
  if (!resend) {
    logger.warn("RESEND_API_KEY not configured — skipping password reset email send.");
    return;
  }

  resend.emails
    .send({
      from: FROM_ADDRESS,
      to,
      subject: "Reset your XFlyve password",
      html: `
        <p>We received a request to reset the password for your XFlyve account.</p>
        <p><a href="${resetUrl}">Reset your password</a></p>
        <p>This link expires in 1 hour and can only be used once. If you didn't request this, you can safely ignore this email.</p>
      `,
    })
    .catch((err) => {
      logger.error("Failed to send password reset email: %o", err);
    });
};

module.exports = { sendPasswordResetEmail };
