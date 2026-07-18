const { validationResult } = require("express-validator");

/**
 * Middleware to handle validation errors from express-validator.
 * Sends 422 with formatted error messages if validation fails.
 */
const validateRequest = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const validationErrors = errors.array().map(err => ({
      field: err.path || err.param,
      message: err.msg,
    }));

    const statusCode =
      req.method === "PUT" && /^\/api\/admin\/drivers\/[^/]+$/.test(req.originalUrl)
        ? 400
        : 422;

    return res.status(statusCode).json({
      success: false,
      status: "fail",
      message: validationErrors.map(err => err.message).join(", "),
      errors: validationErrors,
    });
  }
  next();
};

module.exports = validateRequest;
