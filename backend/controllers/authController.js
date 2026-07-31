const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const Driver = require("../models/driver");
const logger = require("../utils/logger");
const { sendPasswordResetEmail } = require("../services/emailService");

const RESET_TOKEN_BYTES = 32; // 256 bits of entropy
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

// Only ever store/compare a hash of the reset token — the raw token exists
// only in memory here and in the emailed link, never persisted or logged.
const hashResetToken = (rawToken) => crypto.createHash("sha256").update(rawToken).digest("hex");

const toAuthUser = (user) => ({
  id: user._id,
  _id: user._id,
  name: user.name,
  role: user.role,
});

// @desc    Driver signup
exports.signup = async (req, res) => {
  try {
    let { name, email, password } = req.body;

    // Trim inputs
    name = name.trim();
    email = email.trim().toLowerCase();

    // Prevent duplicate emails
    const existing = await Driver.findOne({ email });
    if (existing) {
      return res.status(400).json({ status: "fail", message: "Email already in use" });
    }

    const newDriver = new Driver({
      name,
      email,
      password,
      role: "driver", // force role for signup
    });

    await newDriver.save();

    res.status(201).json({
      status: "success",
      message: "Driver registered successfully",
    });
  } catch (err) {
    logger.error("Signup failed: %o", err);
    res.status(500).json({ status: "error", message: "Server error during signup" });
  }
};

// @desc    Login for admin or driver
exports.login = async (req, res) => {
  try {
    const email = req.body.email.trim().toLowerCase();
    const password = req.body.password;

    const user = await Driver.findOne({ email });
    if (!user) {
      return res.status(401).json({ status: "fail", message: "Invalid credentials" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ status: "fail", message: "Invalid credentials" });
    }

    if (user.recordStatus !== "active" || user.active === false) {
      return res.status(403).json({
        status: "fail",
        message: "Your account is inactive. Please contact your administrator.",
      });
    }

    // Single long-lived (7d) access token, no refresh token — a stolen
    // token is valid for its full lifetime with no way to revoke it early
    // short of rotating JWT_SECRET for everyone. Refresh-token rotation
    // (short-lived access token + revocable refresh token) is a documented
    // future improvement, deliberately not built in this security-hardening
    // pass — out of scope alongside MFA/SSO/OAuth/session management.
    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.status(200).json({
      status: "success",
      token,
      data: toAuthUser(user),
    });
  } catch (err) {
    logger.error("Login failed: %o", err);
    res.status(500).json({ status: "error", message: "Server error during login" });
  }
};

// @desc    Get logged-in user's profile
exports.getProfile = async (req, res) => {
  try {
    const user = await Driver.findById(req.user.id).select("-password");
    if (!user) {
      return res.status(404).json({ status: "fail", message: "User not found" });
    }

    res.status(200).json({ status: "success", data: toAuthUser(user) });
  } catch (err) {
    logger.error("Get profile failed: %o", err);
    res.status(500).json({ status: "error", message: "Server error fetching profile" });
  }
};

// @desc    Request a password reset email
// Always responds the same way regardless of whether the email matches an
// account (or matches an inactive/archived one) — this must never leak
// account existence, the same "no enumeration" guarantee login already
// gives via its generic "Invalid credentials" message.
exports.forgotPassword = async (req, res) => {
  try {
    const email = req.body.email.trim().toLowerCase();
    const user = await Driver.findOne({ email });

    if (user && user.recordStatus === "active" && user.active !== false) {
      const rawToken = crypto.randomBytes(RESET_TOKEN_BYTES).toString("hex");
      user.resetPasswordTokenHash = hashResetToken(rawToken);
      user.resetPasswordExpires = new Date(Date.now() + RESET_TOKEN_TTL_MS);
      await user.save();

      const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${rawToken}`;
      // Not awaited: a slow/unavailable email provider must not hang this
      // response. Failures are logged inside sendPasswordResetEmail.
      sendPasswordResetEmail(user.email, resetUrl);
    }

    res.status(200).json({
      status: "success",
      message: "If an account with that email exists, a password reset link has been sent.",
    });
  } catch (err) {
    logger.error("Forgot password failed: %o", err);
    res.status(500).json({ status: "error", message: "Server error processing password reset request" });
  }
};

// @desc    Complete a password reset using the emailed token
exports.resetPassword = async (req, res) => {
  try {
    const { token, password } = req.body;
    const tokenHash = hashResetToken(token);

    const user = await Driver.findOne({
      resetPasswordTokenHash: tokenHash,
      resetPasswordExpires: { $gt: new Date() },
    });

    if (!user) {
      return res.status(400).json({ status: "fail", message: "Invalid or expired reset token" });
    }

    user.password = password; // pre-save hook re-hashes since it's modified
    // Invalidate immediately so the same token can never be used twice,
    // whether by a legitimate retry or a replay.
    user.resetPasswordTokenHash = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    res.status(200).json({ status: "success", message: "Password has been reset successfully." });
  } catch (err) {
    logger.error("Reset password failed: %o", err);
    res.status(500).json({ status: "error", message: "Server error resetting password" });
  }
};
