// truckValidator.js
const { body, param } = require("express-validator");

exports.truckCreateValidator = [
  body("truckNumber")
    .trim()
    .notEmpty()
    .withMessage("Truck number is required")
    .isLength({ min: 2 })
    .withMessage("Truck number too short")
    .escape(),
  body("capacity")
    .notEmpty()
    .withMessage("Capacity is required")
    .isNumeric()
    .withMessage("Capacity must be a number"),
  body("status")
    .optional()
    .isIn(["out-of-service"])
    .withMessage("Invalid status"),
  body("recordStatus")
    .optional()
    .isIn(["active", "inactive", "archived"])
    .withMessage("Invalid record status"),
  body("assignedDriver")
    .optional()
    .isMongoId()
    .withMessage("Assigned driver must be a valid ID"),
  body("lastMaintenanceDate")
    .optional()
    .isISO8601()
    .withMessage("Maintenance date must be a valid date"),
];

exports.truckUpdateValidator = [
  param("truckId").isMongoId().withMessage("Invalid truck ID"),
  body("truckNumber")
    .optional()
    .trim()
    .notEmpty()
    .withMessage("Truck number cannot be empty")
    .escape(),
  body("capacity")
    .optional()
    .isNumeric()
    .withMessage("Capacity must be a number"),
  body("status")
    .optional()
    .isIn(["available", "out-of-service"])
    .withMessage("Invalid status"),
  body("recordStatus")
    .optional()
    .isIn(["active", "inactive", "archived"])
    .withMessage("Invalid record status"),
  body("assignedDriver")
    .optional()
    .isMongoId()
    .withMessage("Assigned driver must be a valid ID"),
  body("lastMaintenanceDate")
    .optional()
    .isISO8601()
    .withMessage("Maintenance date must be a valid date"),
];
