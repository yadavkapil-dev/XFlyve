const express = require("express");
const router = express.Router();

const authController = require("../controllers/authController");
const authMiddleware = require("../middlewares/authMiddleware"); // <-- Import this
const { signupValidator, loginValidator, forgotPasswordValidator, resetPasswordValidator } = require("../validators/authValidator");
const validateRequest = require("../middlewares/validateRequest");
const { loginLimiter } = require("../config/rateLimiters");

// Register a new driver
router.post("/signup", signupValidator, validateRequest, authController.signup);

// Login driver/admin
router.post("/login", loginLimiter, loginValidator, validateRequest, authController.login);

// Request a password reset email
router.post("/forgot-password", loginLimiter, forgotPasswordValidator, validateRequest, authController.forgotPassword);

// Complete a password reset with the emailed token
router.post("/reset-password", loginLimiter, resetPasswordValidator, validateRequest, authController.resetPassword);

// Get logged-in user profile (protected route)
router.get("/profile", authMiddleware, authController.getProfile);

module.exports = router;
