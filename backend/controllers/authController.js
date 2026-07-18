const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const Driver = require("../models/driver");
const logger = require("../utils/logger");

const toAuthUser = (user) => ({
  id: user._id,
  _id: user._id,
  name: user.name,
  role: user.role,
  driverType: user.driverType,
});

// @desc    Driver signup
exports.signup = async (req, res) => {
  try {
    let { name, email, password, driverType } = req.body;

    // Trim inputs
    name = name.trim();
    email = email.trim().toLowerCase();
    driverType = driverType?.trim();

    // Prevent duplicate emails
    const existing = await Driver.findOne({ email });
    if (existing) {
      return res.status(400).json({ status: "fail", message: "Email already in use" });
    }

    const newDriver = new Driver({
      name,
      email,
      password,
      driverType,
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
