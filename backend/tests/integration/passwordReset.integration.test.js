// Integration: forgot-password / reset-password. Real app, real routes,
// real Mongoose models (including the password-hashing pre-save hook),
// against an isolated in-memory MongoDB (see testDb.js).
//
// The one thing NOT real here is the actual outbound email send — Resend
// is stubbed the same way Cloudinary is stubbed in
// approvalWorkflows.integration.test.js (the one real external I/O
// boundary), so these tests never make a real network call or need a real
// Resend account. The stub also lets tests recover the raw reset token
// that would have been emailed, to simulate the user clicking the link —
// this is an in-memory test double capturing the value, not a log.
process.env.JWT_SECRET = "integration-test-secret";
process.env.RATE_LIMIT_MAX = "10000";
process.env.LOGIN_RATE_LIMIT_MAX = "10000";
process.env.NODE_ENV = "test";
process.env.FRONTEND_URL = "http://localhost:5173";

jest.doMock("../../services/emailService", () => ({
  sendPasswordResetEmail: jest.fn(),
}));

const request = require("supertest");
const { startTestDb, stopTestDb, clearTestDb } = require("./testDb");
const { createDriver, PASSWORD } = require("./factories");
const Driver = require("../../models/driver");
const { sendPasswordResetEmail } = require("../../services/emailService");

let app;

beforeAll(async () => {
  await startTestDb();
  app = require("../../app");
}, 30000);

afterEach(async () => {
  jest.clearAllMocks();
  await clearTestDb();
});

afterAll(async () => {
  await stopTestDb();
});

const requestReset = (email) => request(app).post("/api/auth/forgot-password").send({ email });

const extractRawToken = () => {
  const [, resetUrl] = sendPasswordResetEmail.mock.calls[0];
  return new URL(resetUrl).searchParams.get("token");
};

describe("Flow: forgot-password", () => {
  test("PASS: an existing active driver gets a reset token generated and emailed", async () => {
    const driver = await createDriver({ email: "reset-flow@example.com" });

    const res = await requestReset("reset-flow@example.com");

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/if an account with that email exists/i);
    // Never in the response body under any field.
    expect(JSON.stringify(res.body)).not.toMatch(/token/i);

    expect(sendPasswordResetEmail).toHaveBeenCalledTimes(1);
    const [emailedTo] = sendPasswordResetEmail.mock.calls[0];
    expect(emailedTo).toBe("reset-flow@example.com");

    const persisted = await Driver.findById(driver._id).select("+resetPasswordTokenHash +resetPasswordExpires").lean();
    expect(persisted.resetPasswordTokenHash).toEqual(expect.any(String));
    expect(persisted.resetPasswordExpires).toBeInstanceOf(Date);
    expect(persisted.resetPasswordExpires.getTime()).toBeGreaterThan(Date.now());

    // The raw token is never persisted anywhere — only its hash.
    const rawToken = extractRawToken();
    expect(persisted.resetPasswordTokenHash).not.toBe(rawToken);
  });

  test("PASS: a non-existent email returns the exact same generic response (no enumeration)", async () => {
    const res = await requestReset("nobody-at-all@example.com");

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/if an account with that email exists/i);
    expect(sendPasswordResetEmail).not.toHaveBeenCalled();
  });

  test("PASS: an archived driver's email returns the same generic response and no token is issued", async () => {
    const driver = await createDriver({ email: "archived-reset@example.com", recordStatus: "archived" });

    const res = await requestReset("archived-reset@example.com");

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/if an account with that email exists/i);
    expect(sendPasswordResetEmail).not.toHaveBeenCalled();

    const persisted = await Driver.findById(driver._id).select("+resetPasswordTokenHash").lean();
    expect(persisted.resetPasswordTokenHash).toBeUndefined();
  });

  test("PASS: a deactivated (active:false) driver's email also returns the generic response with no token issued", async () => {
    await createDriver({ email: "deactivated-reset@example.com", active: false });

    const res = await requestReset("deactivated-reset@example.com");

    expect(res.status).toBe(200);
    expect(sendPasswordResetEmail).not.toHaveBeenCalled();
  });
});

describe("Flow: reset-password", () => {
  test("PASS: a valid token resets the password — old password stops working, new one works", async () => {
    await createDriver({ email: "full-reset@example.com" });
    await requestReset("full-reset@example.com");
    const rawToken = extractRawToken();

    const resetRes = await request(app)
      .post("/api/auth/reset-password")
      .send({ token: rawToken, password: "BrandNewPassword1!" });

    expect(resetRes.status).toBe(200);

    const oldLogin = await request(app)
      .post("/api/auth/login")
      .send({ email: "full-reset@example.com", password: PASSWORD });
    expect(oldLogin.status).toBe(401);

    const newLogin = await request(app)
      .post("/api/auth/login")
      .send({ email: "full-reset@example.com", password: "BrandNewPassword1!" });
    expect(newLogin.status).toBe(200);
  });

  test("PASS: the same token cannot be used twice — second attempt is rejected (400)", async () => {
    await createDriver({ email: "reuse-reset@example.com" });
    await requestReset("reuse-reset@example.com");
    const rawToken = extractRawToken();

    const first = await request(app)
      .post("/api/auth/reset-password")
      .send({ token: rawToken, password: "FirstNewPassword1!" });
    expect(first.status).toBe(200);

    const second = await request(app)
      .post("/api/auth/reset-password")
      .send({ token: rawToken, password: "SecondNewPassword1!" });
    expect(second.status).toBe(400);
    expect(second.body.message).toMatch(/invalid or expired/i);

    // The first reset's password is still the one that works.
    const login = await request(app)
      .post("/api/auth/login")
      .send({ email: "reuse-reset@example.com", password: "FirstNewPassword1!" });
    expect(login.status).toBe(200);
  });

  test("PASS: an expired token is rejected (400) even though it's otherwise correctly hashed and matched", async () => {
    const driver = await createDriver({ email: "expired-reset@example.com" });
    await requestReset("expired-reset@example.com");
    const rawToken = extractRawToken();

    // Simulate time passing: push this driver's expiry into the past.
    await Driver.updateOne(
      { _id: driver._id },
      { $set: { resetPasswordExpires: new Date(Date.now() - 1000) } }
    );

    const res = await request(app)
      .post("/api/auth/reset-password")
      .send({ token: rawToken, password: "TooLatePassword1!" });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/invalid or expired/i);
  });

  test("PASS: a made-up/invalid token is rejected (400)", async () => {
    await createDriver({ email: "invalid-token@example.com" });
    await requestReset("invalid-token@example.com");

    const res = await request(app)
      .post("/api/auth/reset-password")
      .send({ token: "not-a-real-token-at-all", password: "WhateverPassword1!" });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/invalid or expired/i);
  });

  test("PASS: a password shorter than the minimum is rejected by validation before the token is even checked", async () => {
    await createDriver({ email: "short-pass@example.com" });
    await requestReset("short-pass@example.com");
    const rawToken = extractRawToken();

    const res = await request(app)
      .post("/api/auth/reset-password")
      .send({ token: rawToken, password: "abc" });

    expect(res.status).toBe(422);

    // Token is still valid/unused since the request never reached the controller.
    const loginWithOld = await request(app)
      .post("/api/auth/login")
      .send({ email: "short-pass@example.com", password: PASSWORD });
    expect(loginWithOld.status).toBe(200);
  });
});
