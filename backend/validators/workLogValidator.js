// workLogValidator.js
const { body, param } = require("express-validator");

exports.validateWorkLog = [
  body("date").optional().isISO8601().withMessage("Valid date is required"),
  body("workDate").optional().isISO8601().withMessage("Valid workDate is required"),
  body("hours").optional().isFloat({ min: 0 }).withMessage("Hours must be a non-negative number"),
  body("kilometers").optional().isFloat({ min: 0 }).withMessage("Kilometers must be a non-negative number"),
  body("localStartTime").optional().isString().withMessage("Truck pickup time must be valid"),
  body("localEndTime").optional().isString().withMessage("Finish time must be valid"),
  body("interstateStartKm").optional().isFloat({ min: 0 }).withMessage("Start kilometres must be a non-negative number"),
  body("interstateEndKm").optional().isFloat({ min: 0 }).withMessage("End kilometres must be a non-negative number"),
  body("deliveriesDone").optional().isInt({ min: 0 }).withMessage("Number of deliveries must be a non-negative number"),
  body("notes").optional().isString(),
  body("jobId").optional().isMongoId().withMessage("Valid job ID is required"),
  body("jobIds").optional().isArray().withMessage("jobIds must be an array"),
  body("jobIds.*").optional().isMongoId().withMessage("Each jobId must be valid"),
];

exports.rejectWorkLogValidator = [
  param("logId").isMongoId().withMessage("Valid log ID is required"),
  body("rejectionReason").trim().notEmpty().withMessage("Rejection reason is required"),
];
