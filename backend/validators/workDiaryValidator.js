const { body, param } = require("express-validator");

exports.uploadWorkDiaryValidator = [
  body("jobId").optional().isMongoId().withMessage("Valid jobId is required"),
  body("truckId").optional().isMongoId().withMessage("Valid truckId is required"),
  body("workDate").optional().isISO8601().withMessage("Valid workDate is required"),
  body("notes").optional().isString().withMessage("Notes must be a string"),
];

exports.workDiaryIdValidator = [
  param("id").isMongoId().withMessage("Valid Work Diary ID is required"),
];

exports.driverIdParamValidator = [
  param("driverId").isMongoId().withMessage("Valid driverId is required"),
];

exports.updateWorkDiaryNotesValidator = [
  param("id").isMongoId().withMessage("Valid Work Diary ID is required"),
  body("notes").optional().isString().withMessage("Notes must be a string"),
];
