const loadValidateEnv = () => {
  jest.resetModules();
  return require("../config/validateEnv");
};

const REQUIRED_KEYS = [
  "MONGO_URI",
  "JWT_SECRET",
  "NODE_ENV",
  "CLOUDINARY_CLOUD_NAME",
  "CLOUDINARY_API_KEY",
  "CLOUDINARY_API_SECRET",
  "CORS_WHITELIST",
  "FRONTEND_URL",
  "SENTRY_DSN",
  "LOG_LEVEL",
];

const makeLogger = () => ({ error: jest.fn() });

describe("validateEnv", () => {
  const originalEnv = { ...process.env };
  let exitSpy;

  beforeEach(() => {
    REQUIRED_KEYS.forEach((key) => delete process.env[key]);
    exitSpy = jest.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit called");
    });
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    jest.restoreAllMocks();
  });

  test("fails startup with a safe message when a required variable is missing", () => {
    const validateEnv = loadValidateEnv();
    process.env.MONGO_URI = "mongodb://localhost:27017/test";
    // JWT_SECRET intentionally left unset

    const logger = makeLogger();

    expect(() => validateEnv(logger)).toThrow("process.exit called");
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining("JWT_SECRET")
    );
    // The message must never contain the value of any variable, only names.
    expect(logger.error.mock.calls[0][0]).not.toContain("mongodb://");
  });

  test("fails startup listing every missing required variable, not just the first", () => {
    const validateEnv = loadValidateEnv();
    const logger = makeLogger();

    expect(() => validateEnv(logger)).toThrow("process.exit called");
    const message = logger.error.mock.calls[0][0];
    expect(message).toContain("MONGO_URI");
    expect(message).toContain("JWT_SECRET");
  });

  test("boots successfully in development when only the base required vars are present", () => {
    const validateEnv = loadValidateEnv();
    process.env.MONGO_URI = "mongodb://localhost:27017/test";
    process.env.JWT_SECRET = "dev-secret";
    process.env.NODE_ENV = "development";
    // No Cloudinary/CORS/Sentry configured — optional in development.

    const logger = makeLogger();

    expect(() => validateEnv(logger)).not.toThrow();
    expect(exitSpy).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
  });

  test("optional integrations (Sentry) never block startup even when fully unset", () => {
    const validateEnv = loadValidateEnv();
    process.env.MONGO_URI = "mongodb://localhost:27017/test";
    process.env.JWT_SECRET = "dev-secret";
    process.env.NODE_ENV = "development";
    process.env.CLOUDINARY_CLOUD_NAME = "demo";
    process.env.CLOUDINARY_API_KEY = "demo";
    process.env.CLOUDINARY_API_SECRET = "demo";
    process.env.CORS_WHITELIST = "http://localhost:5173";
    delete process.env.SENTRY_DSN;

    const logger = makeLogger();

    expect(() => validateEnv(logger)).not.toThrow();
    expect(exitSpy).not.toHaveBeenCalled();
  });

  test("in production, also requires Cloudinary vars and fails without them", () => {
    const validateEnv = loadValidateEnv();
    process.env.MONGO_URI = "mongodb://prod/test";
    process.env.JWT_SECRET = "prod-secret";
    process.env.NODE_ENV = "production";
    process.env.CORS_WHITELIST = "https://app.example.com";
    // Cloudinary vars intentionally left unset.

    const logger = makeLogger();

    expect(() => validateEnv(logger)).toThrow("process.exit called");
    const message = logger.error.mock.calls[0][0];
    expect(message).toContain("CLOUDINARY_CLOUD_NAME");
    expect(message).toContain("CLOUDINARY_API_KEY");
    expect(message).toContain("CLOUDINARY_API_SECRET");
  });

  test("in production, requires at least one of CORS_WHITELIST or FRONTEND_URL", () => {
    const validateEnv = loadValidateEnv();
    process.env.MONGO_URI = "mongodb://prod/test";
    process.env.JWT_SECRET = "prod-secret";
    process.env.NODE_ENV = "production";
    process.env.CLOUDINARY_CLOUD_NAME = "demo";
    process.env.CLOUDINARY_API_KEY = "demo";
    process.env.CLOUDINARY_API_SECRET = "demo";
    // Neither CORS_WHITELIST nor FRONTEND_URL set.

    const logger = makeLogger();

    expect(() => validateEnv(logger)).toThrow("process.exit called");
    expect(logger.error.mock.calls[0][0]).toContain("CORS_WHITELIST or FRONTEND_URL");
  });

  test("in production, FRONTEND_URL alone satisfies the CORS requirement", () => {
    const validateEnv = loadValidateEnv();
    process.env.MONGO_URI = "mongodb://prod/test";
    process.env.JWT_SECRET = "prod-secret";
    process.env.NODE_ENV = "production";
    process.env.CLOUDINARY_CLOUD_NAME = "demo";
    process.env.CLOUDINARY_API_KEY = "demo";
    process.env.CLOUDINARY_API_SECRET = "demo";
    process.env.FRONTEND_URL = "https://app.example.com";

    const logger = makeLogger();

    expect(() => validateEnv(logger)).not.toThrow();
    expect(exitSpy).not.toHaveBeenCalled();
  });

  test("boots successfully in production when every required and production-required var is present", () => {
    const validateEnv = loadValidateEnv();
    process.env.MONGO_URI = "mongodb://prod/test";
    process.env.JWT_SECRET = "prod-secret";
    process.env.NODE_ENV = "production";
    process.env.CLOUDINARY_CLOUD_NAME = "demo";
    process.env.CLOUDINARY_API_KEY = "demo";
    process.env.CLOUDINARY_API_SECRET = "demo";
    process.env.CORS_WHITELIST = "https://app.example.com";

    const logger = makeLogger();

    expect(() => validateEnv(logger)).not.toThrow();
    expect(exitSpy).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
  });
});
