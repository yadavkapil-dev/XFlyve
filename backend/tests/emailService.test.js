// Unit tests for services/emailService.js itself (not the controller hook-ins
// — those are covered by tests/emailTriggers.test.js). Mocks the `resend`
// package directly so these can exercise both real failure shapes the SDK
// produces: a resolved { data: null, error } response (the common case —
// see the comment in emailService.js on why resend.emails.send() rarely
// rejects) and a thrown/rejected send (network-level failures).
const ORIGINAL_ENV = process.env;

const loadService = ({ sendImpl } = {}) => {
  jest.resetModules();
  process.env = { ...ORIGINAL_ENV, RESEND_API_KEY: "test-key", FRONTEND_URL: "http://localhost:5173" };
  delete process.env.RESEND_FROM_EMAIL;

  const send = jest.fn(sendImpl);
  const logErrorSpy = jest.fn();
  const instances = [];

  class FakeResend {
    constructor() {
      this.emails = { send };
      // The real SDK's own instance method that emailService.js should
      // shadow with a no-op — asserted on directly below.
      this.logError = logErrorSpy;
      instances.push(this);
    }
  }

  const logger = { warn: jest.fn(), error: jest.fn() };

  jest.doMock("resend", () => ({ Resend: FakeResend }));
  jest.doMock("../utils/logger", () => logger);

  const emailService = require("../services/emailService");
  return { emailService, send, logger, instances, logErrorSpy };
};

// Lets the fire-and-forget .then()/.catch() chain inside emailService.js
// settle before assertions run — these functions are never awaited by
// design, matching the real callers (authController.js etc).
const flush = () => new Promise((resolve) => setImmediate(resolve));

afterEach(() => {
  process.env = ORIGINAL_ENV;
  jest.restoreAllMocks();
});

describe("emailService: suppressing the SDK's own internal error logging", () => {
  test("shadows the Resend client's logError with a no-op — the SDK's own console.error path never fires", () => {
    const { instances, logErrorSpy } = loadService({ sendImpl: async () => ({ data: { id: "1" }, error: null }) });
    const instance = instances[0];

    expect(instance.logError).not.toBe(logErrorSpy);

    // Simulates what fetchRequest() internally does on an API error —
    // confirm it's now a no-op and never reaches the original method.
    expect(() => instance.logError({ message: "some api error" }, "/emails", 422)).not.toThrow();
    expect(logErrorSpy).not.toHaveBeenCalled();
  });
});

describe("emailService: send failures are logged via our logger, never leaking the recipient's email", () => {
  test("sendPasswordResetEmail: a resolved { error } response (the common Resend failure shape) is logged, sanitized", async () => {
    const { emailService, send, logger } = loadService({
      sendImpl: async () => ({
        data: null,
        error: {
          name: "validation_error",
          statusCode: 422,
          message: "You can only send testing emails to your own email address (driver@example.com).",
        },
      }),
    });

    emailService.sendPasswordResetEmail("driver@example.com", "http://localhost:5173/reset-password?token=abc");
    await flush();

    expect(send).toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith("Failed to send password reset email: %o", {
      name: "validation_error",
      statusCode: 422,
      code: undefined,
    });

    const loggedText = JSON.stringify(logger.error.mock.calls);
    expect(loggedText).not.toContain("driver@example.com");
    expect(loggedText).not.toContain("You can only send testing emails");
  });

  test("sendJobAssignedEmail: a thrown/rejected send is logged, sanitized, even if its message happens to mention the recipient", async () => {
    const { emailService, logger } = loadService({
      sendImpl: async () => {
        throw Object.assign(new Error("fetch failed while sending to driver@example.com"), { code: "ENOTFOUND" });
      },
    });

    emailService.sendJobAssignedEmail("driver@example.com", {
      title: "Run 1",
      pickupLocation: "Warehouse A",
      deliveryLocation: "Customer B",
    });
    await flush();

    expect(logger.error).toHaveBeenCalledWith("Failed to send job assigned email: %o", {
      name: "Error",
      statusCode: undefined,
      code: "ENOTFOUND",
    });

    const loggedText = JSON.stringify(logger.error.mock.calls);
    expect(loggedText).not.toContain("driver@example.com");
  });

  test("sendDocumentRejectedEmail: a resolved { error } response is logged, sanitized, and the rejection reason never appears in the log", async () => {
    const { emailService, logger } = loadService({
      sendImpl: async () => ({ data: null, error: { name: "rate_limit_exceeded", statusCode: 429 } }),
    });

    emailService.sendDocumentRejectedEmail("driver@example.com", {
      documentType: "pod",
      reason: "photo shows the wrong address, driver@example.com should re-upload",
    });
    await flush();

    expect(logger.error).toHaveBeenCalledWith("Failed to send document rejected email: %o", {
      name: "rate_limit_exceeded",
      statusCode: 429,
      code: undefined,
    });

    const loggedText = JSON.stringify(logger.error.mock.calls);
    expect(loggedText).not.toContain("driver@example.com");
    expect(loggedText).not.toContain("wrong address");
  });

  test("a successful send (resolved with no error) logs nothing", async () => {
    const { emailService, logger } = loadService({ sendImpl: async () => ({ data: { id: "email-1" }, error: null }) });

    emailService.sendPasswordResetEmail("driver@example.com", "http://localhost:5173/reset-password?token=abc");
    await flush();

    expect(logger.error).not.toHaveBeenCalled();
  });
});
