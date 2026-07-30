// jobValidator.js
const { body } = require("express-validator");

// Validation for creating a job
exports.createJobValidator = [
  body("title").trim().notEmpty().withMessage("Title is required").escape(),
  body("description").optional().trim().notEmpty().withMessage("Description cannot be empty").escape(),
  body("pickupLocation").trim().notEmpty().withMessage("Pickup location is required").escape(),
  body("deliveryLocation").trim().notEmpty().withMessage("Delivery location is required").escape(),
  body("customerReference").optional().trim().isString().withMessage("Customer reference must be a string"),
  body("jobRate").optional().isFloat({ min: 0 }).withMessage("Job rate must be a non-negative number"),
  body("invoiceStatus").optional().isIn(["pending", "ready", "invoiced", "paid"]).withMessage("Invalid invoice status"),
  body("recordStatus").optional().isIn(["active", "inactive", "archived"]).withMessage("Invalid record status"),
  body("assignedTo").isMongoId().withMessage("Valid driver ID is required"),
  body("assignedTruck").isMongoId().withMessage("Valid truck ID is required"),
  body("jobDate").isISO8601().withMessage("Valid job date is required"),
  body("startTime").trim().notEmpty().withMessage("Start time is required"),
  body("jobType").isIn(["interstate", "local"]).withMessage("Job type must be 'interstate' or 'local'"),
];

// Validation for updating a job (all fields optional but validated if present)
exports.updateJobValidator = [
  body("title").optional().trim().notEmpty().withMessage("Title cannot be empty").escape(),
  body("description").optional().trim().notEmpty().withMessage("Description cannot be empty").escape(),
  body("pickupLocation").optional().trim().notEmpty().withMessage("Pickup location cannot be empty").escape(),
  body("deliveryLocation").optional().trim().notEmpty().withMessage("Delivery location cannot be empty").escape(),
  body("customerReference").optional().trim().isString().withMessage("Customer reference must be a string"),
  body("jobRate").optional().isFloat({ min: 0 }).withMessage("Job rate must be a non-negative number"),
  body("invoiceStatus").optional().isIn(["pending", "ready", "invoiced", "paid"]).withMessage("Invalid invoice status"),
  body("recordStatus").optional().isIn(["active", "inactive", "archived"]).withMessage("Invalid record status"),
  body("assignedTo").optional().isMongoId().withMessage("Valid driver ID is required"),
  body("assignedTruck").optional().isMongoId().withMessage("Valid truck ID is required"),
  body("jobDate").optional().isISO8601().withMessage("Valid job date is required"),
  body("startTime").optional().trim().notEmpty().withMessage("Start time cannot be empty"),
  body("status").optional().isIn(["pending", "in-progress", "completed"]).withMessage("Invalid status"),
  body("jobType").optional().isIn(["interstate", "local"]).withMessage("Job type must be 'interstate' or 'local'"),
];
