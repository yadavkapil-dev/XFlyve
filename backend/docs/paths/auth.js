const h = require("../helpers");
const { FAKE_JWT, FAKE_RESET_TOKEN, FAKE_DRIVER_ID } = h.FAKE_IDS;

module.exports = {
  "/api/auth/signup": {
    post: {
      tags: ["Authentication"],
      summary: "Register a new driver account",
      description: "Public. Role is always forced to \"driver\" regardless of what's sent — this endpoint cannot create admins.",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["name", "email", "password"],
              properties: {
                name: { type: "string", example: "Jane Driver" },
                email: { type: "string", example: "jane.driver@example.com" },
                password: { type: "string", minLength: 6, example: "S3cur3Pass!" },
                driverType: { type: "string", enum: ["local", "interstate"], example: "local" },
              },
            },
          },
        },
      },
      responses: {
        201: { description: "Registered.", content: { "application/json": { example: { status: "success", message: "Driver registered successfully" } } } },
        400: h.badRequestStatus("Email already in use"),
        422: h.validationErrorSuccess("Valid email is required"),
        500: h.serverErrorStatus,
      },
    },
  },
  "/api/auth/login": {
    post: {
      tags: ["Authentication"],
      summary: "Log in (driver or admin)",
      description: "Public, but rate-limited more strictly than the general API limit (10 requests / 15 min per IP by default) as brute-force protection. Returns a 7-day JWT — no refresh token exists (see API description).",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["email", "password"],
              properties: { email: { type: "string", example: "jane.driver@example.com" }, password: { type: "string", example: "S3cur3Pass!" } },
            },
          },
        },
      },
      responses: {
        200: {
          description: "Authenticated.",
          content: { "application/json": { example: { status: "success", token: FAKE_JWT, data: { id: FAKE_DRIVER_ID, _id: FAKE_DRIVER_ID, name: "Jane Driver", role: "driver", driverType: "local" } } } },
        },
        401: {
          description: "Wrong email or password. Deliberately identical message for both cases — no user enumeration.",
          content: { "application/json": { example: { status: "fail", message: "Invalid credentials" } } },
        },
        403: {
          description: "Credentials correct, but the account is inactive/archived.",
          content: { "application/json": { example: { status: "fail", message: "Your account is inactive. Please contact your administrator." } } },
        },
        429: { description: "Too many login attempts from this IP.", content: { "application/json": { example: { success: false, message: "Too many login attempts, please try again later.", retryAfter: 900 } } } },
        500: h.serverErrorStatus,
      },
    },
  },
  "/api/auth/forgot-password": {
    post: {
      tags: ["Authentication"],
      summary: "Request a password reset email",
      description:
        "Public, same strict rate limit as login. Always returns the identical 200 response whether or not the email matches an account (or matches an inactive one) — this must never leak account existence. " +
        "On a real match: generates a 256-bit random token, stores only its SHA-256 hash + a 1-hour expiry, and emails the raw token as a reset link via Resend — sent fire-and-forget so a slow/down email provider can't hang this response.",
      requestBody: {
        required: true,
        content: { "application/json": { schema: { type: "object", required: ["email"], properties: { email: { type: "string", example: "jane.driver@example.com" } } } } },
      },
      responses: {
        200: {
          description: "Always this response, regardless of whether the account exists.",
          content: { "application/json": { example: { status: "success", message: "If an account with that email exists, a password reset link has been sent." } } },
        },
        422: h.validationErrorSuccess("Valid email is required"),
        429: { description: "Too many requests from this IP.", content: { "application/json": { example: { success: false, message: "Too many login attempts, please try again later.", retryAfter: 900 } } } },
        500: h.serverErrorStatus,
      },
    },
  },
  "/api/auth/reset-password": {
    post: {
      tags: ["Authentication"],
      summary: "Complete a password reset using the emailed token",
      description: "Public, same strict rate limit. Hashes the incoming raw token and compares to the stored hash + expiry. On success, the token is cleared immediately so it can never be reused (by the legitimate user retrying, or a replay).",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: { type: "object", required: ["token", "password"], properties: { token: { type: "string", example: FAKE_RESET_TOKEN }, password: { type: "string", minLength: 6, example: "N3wS3cur3Pass!" } } },
          },
        },
      },
      responses: {
        200: { description: "Password reset.", content: { "application/json": { example: { status: "success", message: "Password has been reset successfully." } } } },
        400: { description: "Token is invalid, expired, or already used — same message for all three, so a client can't distinguish which.", content: { "application/json": { example: { status: "fail", message: "Invalid or expired reset token" } } } },
        422: h.validationErrorSuccess("Password must be at least 6 characters"),
        429: { description: "Too many requests from this IP.", content: { "application/json": { example: { success: false, message: "Too many login attempts, please try again later.", retryAfter: 900 } } } },
        500: h.serverErrorStatus,
      },
    },
  },
  "/api/auth/profile": {
    get: {
      tags: ["Authentication"],
      summary: "Get the authenticated user's own profile",
      security: h.bearer,
      responses: {
        200: { description: "OK.", content: { "application/json": { example: { status: "success", data: { id: FAKE_DRIVER_ID, _id: FAKE_DRIVER_ID, name: "Jane Driver", role: "driver", driverType: "local" } } } } },
        401: h.unauthorized,
        404: h.notFoundStatus("User"),
        500: h.serverErrorStatus,
      },
    },
  },
};
