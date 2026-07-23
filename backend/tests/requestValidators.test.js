// The validator files (backend/validators/*.js) already report ~100% Istanbul
// coverage — but that number comes entirely from requiring the file, which
// executes each express-validator body()/param() chain-builder once at
// module load. None of that proves the validator actually rejects bad input
// at request time. These tests mount the REAL validator + the REAL
// validateRequest middleware (no mocks) behind a throwaway route and send
// real HTTP requests through supertest, so they exercise the runtime
// validation behavior the coverage number was silently not testing.
const express = require("express");
const request = require("supertest");

const { createJobValidator, updateJobValidator } = require("../validators/jobValidator");
const { rejectPODValidator } = require("../validators/jobPodValidator");
const { validateWorkLog } = require("../validators/workLogValidator");
const validateRequest = require("../middlewares/validateRequest");

const buildApp = (method, path, validators) => {
  const app = express();
  app.use(express.json());
  app[method](path, ...validators, validateRequest, (req, res) => res.status(200).json({ ok: true }));
  return app;
};

describe("createJobValidator (real request behavior)", () => {
  const validPayload = {
    title: "Local delivery",
    description: "Drop freight",
    pickupLocation: "Depot",
    deliveryLocation: "Customer",
    assignedTo: "507f1f77bcf86cd799439011",
    assignedTruck: "507f1f77bcf86cd799439012",
    jobDate: "2026-08-01",
    jobType: "local",
  };

  test("accepts a fully valid payload", async () => {
    const app = buildApp("post", "/test", createJobValidator);
    const res = await request(app).post("/test").send(validPayload);
    expect(res.status).toBe(200);
  });

  test("rejects a missing required field (title) with the field's own message", async () => {
    const app = buildApp("post", "/test", createJobValidator);
    const { title, ...rest } = validPayload;
    const res = await request(app).post("/test").send(rest);

    expect(res.status).toBe(422);
    expect(res.body.message).toMatch(/Title is required/);
  });

  test("rejects a title that's only whitespace (trim + notEmpty)", async () => {
    const app = buildApp("post", "/test", createJobValidator);
    const res = await request(app).post("/test").send({ ...validPayload, title: "   " });

    expect(res.status).toBe(422);
    expect(res.body.message).toMatch(/Title is required/);
  });

  test("rejects an invalid jobType enum value", async () => {
    const app = buildApp("post", "/test", createJobValidator);
    const res = await request(app).post("/test").send({ ...validPayload, jobType: "intergalactic" });

    expect(res.status).toBe(422);
    expect(res.body.message).toMatch(/Job type must be 'interstate' or 'local'/);
  });

  test("rejects a non-ObjectId assignedTruck", async () => {
    const app = buildApp("post", "/test", createJobValidator);
    const res = await request(app).post("/test").send({ ...validPayload, assignedTruck: "not-an-id" });

    expect(res.status).toBe(422);
    expect(res.body.message).toMatch(/Valid truck ID is required/);
  });

  test("rejects a negative jobRate even though jobRate itself is optional", async () => {
    const app = buildApp("post", "/test", createJobValidator);
    const res = await request(app).post("/test").send({ ...validPayload, jobRate: -5 });

    expect(res.status).toBe(422);
    expect(res.body.message).toMatch(/Job rate must be a non-negative number/);
  });
});

describe("updateJobValidator (real request behavior) — everything optional, but still validated when present", () => {
  test("an empty body passes — nothing is required on update", async () => {
    const app = buildApp("put", "/test", updateJobValidator);
    const res = await request(app).put("/test").send({});
    expect(res.status).toBe(200);
  });

  test("an invalid status enum is still rejected even though status is optional", async () => {
    const app = buildApp("put", "/test", updateJobValidator);
    const res = await request(app).put("/test").send({ status: "cancelled" });

    expect(res.status).toBe(422);
    expect(res.body.message).toMatch(/Invalid status/);
  });

  test("an explicitly empty title is rejected (optional means 'may be omitted', not 'may be blank')", async () => {
    const app = buildApp("put", "/test", updateJobValidator);
    const res = await request(app).put("/test").send({ title: "" });

    expect(res.status).toBe(422);
    expect(res.body.message).toMatch(/Title cannot be empty/);
  });
});

describe("rejectPODValidator (real request behavior) — representative of the shared reject-reason rule (POD/diary/worklog)", () => {
  const validId = "507f1f77bcf86cd799439011";

  test("requires a rejection reason", async () => {
    const app = buildApp("put", "/test/:podId", rejectPODValidator);
    const res = await request(app).put(`/test/${validId}`).send({});

    expect(res.status).toBe(422);
    expect(res.body.message).toMatch(/Rejection reason is required/);
  });

  test("rejects a whitespace-only reason — a reviewer must give an actual reason, not blank text", async () => {
    const app = buildApp("put", "/test/:podId", rejectPODValidator);
    const res = await request(app).put(`/test/${validId}`).send({ rejectionReason: "   " });

    expect(res.status).toBe(422);
    expect(res.body.message).toMatch(/Rejection reason is required/);
  });

  test("accepts a real rejection reason", async () => {
    const app = buildApp("put", "/test/:podId", rejectPODValidator);
    const res = await request(app).put(`/test/${validId}`).send({ rejectionReason: "Photo is blurry" });

    expect(res.status).toBe(200);
  });

  test("rejects a malformed podId in the URL param", async () => {
    const app = buildApp("put", "/test/:podId", rejectPODValidator);
    const res = await request(app).put("/test/not-an-id").send({ rejectionReason: "Photo is blurry" });

    expect(res.status).toBe(422);
    expect(res.body.message).toMatch(/Valid POD ID is required/);
  });
});

describe("validateWorkLog (real request behavior) — jobIds array validation", () => {
  test("rejects a non-ObjectId element inside jobIds", async () => {
    const app = buildApp("post", "/test", validateWorkLog);
    const res = await request(app).post("/test").send({ jobIds: ["not-an-id"] });

    expect(res.status).toBe(422);
    expect(res.body.message).toMatch(/Each jobId must be valid/);
  });

  test("rejects jobIds that isn't an array", async () => {
    const app = buildApp("post", "/test", validateWorkLog);
    const res = await request(app).post("/test").send({ jobIds: "507f1f77bcf86cd799439011" });

    expect(res.status).toBe(422);
    expect(res.body.message).toMatch(/jobIds must be an array/);
  });

  test("accepts a valid array of ObjectIds", async () => {
    const app = buildApp("post", "/test", validateWorkLog);
    const res = await request(app)
      .post("/test")
      .send({ jobIds: ["507f1f77bcf86cd799439011", "507f1f77bcf86cd799439012"] });

    expect(res.status).toBe(200);
  });
});
