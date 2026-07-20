const request = require("supertest");

// server.js is a bootstrap script, not an exported app — it connects to
// Mongo and calls app.listen() as a side effect of being required. To test
// its real /healthz handler without a live Mongo connection or a real bound
// port, this mocks config/db (no real connection attempt) and intercepts
// express.application.listen (capturing the exact app instance server.js
// creates, and returning a fake handle rather than actually binding a
// port). No changes to server.js itself.
//
// express must be required fresh in this same resetModules() scope — a
// reference obtained before resetModules() would be a different module
// instance than the one server.js picks up, so spying on it wouldn't
// intercept anything (this bit us the same way in dbCapabilities.test.js).
const loadServerApp = () => {
  jest.resetModules();

  const express = require("express");
  let capturedApp = null;
  // Only intercept server.js's own startup listen() call (the first one) —
  // supertest also calls app.listen() internally per-request to spin up an
  // ephemeral test server, and that one must hit the real implementation.
  jest.spyOn(express.application, "listen").mockImplementationOnce(function () {
    capturedApp = this;
    return { close: jest.fn() };
  });

  jest.doMock("../config/db", () => jest.fn().mockResolvedValue(undefined));
  jest.doMock("../config/sentry", () => ({
    Sentry: { setupExpressErrorHandler: jest.fn() },
    isSentryEnabled: false,
  }));
  jest.doMock("../utils/logger", () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }));

  require("../server");
  const mongoose = require("mongoose");

  return { getApp: () => capturedApp, mongoose };
};

// connectDB().then(...) resolves asynchronously, so the app.listen() call
// (and therefore our capture of `app`) happens a tick after require().
const flushMicrotasks = () => new Promise((resolve) => setImmediate(resolve));

describe("GET /healthz", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("reports healthy (200) when MongoDB is connected", async () => {
    const { getApp, mongoose } = loadServerApp();
    await flushMicrotasks();
    mongoose.connection.readyState = 1; // connected

    const res = await request(getApp()).get("/healthz");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: "ok", database: "connected" });
    expect(typeof res.body.uptime).toBe("number");
  });

  test("reports degraded (503) when MongoDB is not connected", async () => {
    const { getApp, mongoose } = loadServerApp();
    await flushMicrotasks();
    mongoose.connection.readyState = 0; // disconnected

    const res = await request(getApp()).get("/healthz");

    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ status: "degraded", database: "disconnected" });
  });

  test("reports degraded (503) while MongoDB is mid-reconnect", async () => {
    const { getApp, mongoose } = loadServerApp();
    await flushMicrotasks();
    mongoose.connection.readyState = 2; // connecting

    const res = await request(getApp()).get("/healthz");

    expect(res.status).toBe(503);
    expect(res.body.database).toBe("disconnected");
  });

  test("does not expose secrets or internal detail in the response body", async () => {
    const { getApp, mongoose } = loadServerApp();
    await flushMicrotasks();
    mongoose.connection.readyState = 1;

    const res = await request(getApp()).get("/healthz");

    const body = JSON.stringify(res.body);
    expect(body).not.toMatch(/mongodb(\+srv)?:\/\//i);
    expect(body).not.toMatch(/JWT_SECRET|CLOUDINARY|SENTRY_DSN/i);
    expect(Object.keys(res.body).sort()).toEqual(["database", "status", "uptime"]);
  });
});
