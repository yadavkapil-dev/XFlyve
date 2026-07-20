// Required in every environment: without these, the app cannot function.
const REQUIRED_VARS = ["MONGO_URI", "JWT_SECRET"];

// Required only in production: core integrations that must be configured
// before going live, but that local/dev setups may reasonably omit.
const PRODUCTION_REQUIRED_VARS = [
  "CLOUDINARY_CLOUD_NAME",
  "CLOUDINARY_API_KEY",
  "CLOUDINARY_API_SECRET",
];

/**
 * Validates presence of required environment variables and exits the
 * process with a safe, non-sensitive message if any are missing.
 * Never logs variable values, only names.
 */
const validateEnv = (logger) => {
  const missing = REQUIRED_VARS.filter((key) => !process.env[key]);

  if (process.env.NODE_ENV === "production") {
    missing.push(...PRODUCTION_REQUIRED_VARS.filter((key) => !process.env[key]));

    if (!process.env.CORS_WHITELIST && !process.env.FRONTEND_URL) {
      missing.push("CORS_WHITELIST or FRONTEND_URL");
    }
  }

  if (missing.length > 0) {
    logger.error(
      `Startup aborted: missing required environment variable(s): ${missing.join(", ")}`
    );
    process.exit(1);
  }
};

module.exports = validateEnv;
