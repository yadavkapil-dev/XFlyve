// authValidator.js
const { body, param } = require("express-validator");

// Signup input validation rules
exports.signupValidator = [
  body("name").trim().notEmpty().withMessage("Name is required").escape(),
  body("email").trim().normalizeEmail().isEmail().withMessage("Valid email is required"),
  body("password")
    .trim()
    .isLength({ min: 6 })
    .withMessage("Password must be at least 6 characters"),
  body("driverType")
    .optional()
    .trim()
    .isIn(["local", "interstate"])
    .withMessage("driverType must be 'local' or 'interstate'"),
  body("phone").optional().trim().isString().withMessage("Phone must be a string"),
  body("active").optional().isBoolean().withMessage("Active must be true or false"),
  body("recordStatus").optional().isIn(["active", "inactive", "archived"]).withMessage("Invalid record status"),
  body("payType")
    .optional()
    .isIn(["hourly", "per_km", "per_delivery", "salary", "contractor"])
    .withMessage("Invalid payType"),
  body("hourlyRate").optional().isFloat({ min: 0 }).withMessage("Hourly rate must be non-negative"),
  body("kmRate").optional().isFloat({ min: 0 }).withMessage("KM rate must be non-negative"),
  body("deliveryRate").optional().isFloat({ min: 0 }).withMessage("Delivery rate must be non-negative"),
  body("abn").optional().trim().isString().withMessage("ABN must be a string"),
];

// Login input validation rules
exports.loginValidator = [
  body("email").trim().normalizeEmail().isEmail().withMessage("Valid email is required"),
  body("password").trim().notEmpty().withMessage("Password is required"),
];

// New driver creation validator (for admin create driver)
exports.driverCreationValidator = [
  body("name").trim().notEmpty().withMessage("Name is required").escape(),
  body("email").trim().normalizeEmail().isEmail().withMessage("Valid email is required"),
  body("password")
    .trim()
    .isLength({ min: 6 })
    .withMessage("Password must be at least 6 characters"),
  body("driverType")
    .optional()
    .trim()
    .isIn(["local", "interstate"])
    .withMessage("driverType must be 'local' or 'interstate'"),
];

exports.driverUpdateValidator = [
  param("driverId").isMongoId().withMessage("Invalid driver ID"),
  body("name").trim().notEmpty().withMessage("Name is required").escape(),
  body("email").trim().normalizeEmail().isEmail().withMessage("Valid email is required"),
  body("password")
    .optional({ values: "falsy" })
    .trim()
    .isLength({ min: 6 })
    .withMessage("Password must be at least 6 characters"),
];
