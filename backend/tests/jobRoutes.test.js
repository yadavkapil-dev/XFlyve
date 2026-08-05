const express = require("express");
const request = require("supertest");

const VALID_JOB_ID = "507f1f77bcf86cd799439011";

// getJobById does Job.findById(id).populate("assignedTo",...).populate("assignedTruck",...).lean()
const doublePopulatedFindById = (job) => ({
  populate: jest.fn().mockReturnValue({
    populate: jest.fn().mockReturnValue({
      lean: jest.fn().mockResolvedValue(job),
    }),
  }),
});

// getMyJobs/getAssignedJobs do Job.find({...}).sort(...).populate("assignedTruck",...).lean()
const singlePopulatedFind = (jobs) => ({
  sort: jest.fn().mockReturnValue({
    populate: jest.fn().mockReturnValue({
      lean: jest.fn().mockResolvedValue(jobs),
    }),
  }),
});

// Mounts the real jobRoutes.js router (real routing/ordering, real role
// gates, real validateMongoId) with authMiddleware stubbed to the given
// user and the Job model mocked — matches the mocking approach used
// throughout the existing suite (jest.doMock the models, never a real DB).
const loadApp = (user) => {
  jest.resetModules();

  const Job = { findById: jest.fn(), find: jest.fn() };
  const Driver = { findById: jest.fn() };
  const Truck = {};

  jest.doMock("../models/job", () => Job);
  jest.doMock("../models/driver", () => Driver);
  jest.doMock("../models/truck", () => Truck);
  jest.doMock("../middlewares/authMiddleware", () => (req, res, next) => {
    req.user = user;
    next();
  });
  jest.doMock("../utils/logger", () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn() }));

  const jobRoutes = require("../routes/jobRoutes");
  const app = express();
  app.use(express.json());
  app.use("/api/jobs", jobRoutes);

  return { app, Job };
};

describe("GET /api/jobs/:jobId", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("a driver can fetch their own assigned job", async () => {
    const { app, Job } = loadApp({ id: "driver-1", role: "driver" });
    Job.findById.mockReturnValueOnce(
      doublePopulatedFindById({
        _id: VALID_JOB_ID,
        title: "Local delivery",
        assignedTo: { _id: "driver-1", name: "Driver One", email: "driver1@example.com" },
        assignedTruck: { _id: "truck-1", truckNumber: "T1" },
      })
    );

    const res = await request(app).get(`/api/jobs/${VALID_JOB_ID}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: "success", data: { _id: VALID_JOB_ID } });
    expect(Job.findById).toHaveBeenCalledWith(VALID_JOB_ID);
  });

  test("a driver is denied access to another driver's job", async () => {
    const { app, Job } = loadApp({ id: "driver-1", role: "driver" });
    Job.findById.mockReturnValueOnce(
      doublePopulatedFindById({
        _id: VALID_JOB_ID,
        title: "Someone else's delivery",
        assignedTo: { _id: "driver-2", name: "Driver Two", email: "driver2@example.com" },
        assignedTruck: { _id: "truck-1", truckNumber: "T1" },
      })
    );

    const res = await request(app).get(`/api/jobs/${VALID_JOB_ID}`);

    expect(res.status).toBe(403);
  });

  test("an admin can fetch any job", async () => {
    const { app, Job } = loadApp({ id: "admin-1", role: "admin" });
    Job.findById.mockReturnValueOnce(
      doublePopulatedFindById({
        _id: VALID_JOB_ID,
        title: "Any driver's delivery",
        assignedTo: { _id: "driver-2", name: "Driver Two", email: "driver2@example.com" },
        assignedTruck: { _id: "truck-1", truckNumber: "T1" },
      })
    );

    const res = await request(app).get(`/api/jobs/${VALID_JOB_ID}`);

    expect(res.status).toBe(200);
  });

  test("returns 404 when the job does not exist", async () => {
    const { app, Job } = loadApp({ id: "driver-1", role: "driver" });
    Job.findById.mockReturnValueOnce(doublePopulatedFindById(null));

    const res = await request(app).get(`/api/jobs/${VALID_JOB_ID}`);

    expect(res.status).toBe(404);
  });

  test("returns 400 for a malformed job id", async () => {
    const { app, Job } = loadApp({ id: "driver-1", role: "driver" });

    const res = await request(app).get("/api/jobs/not-a-valid-id");

    expect(res.status).toBe(400);
    expect(Job.findById).not.toHaveBeenCalled();
  });
});

describe("GET /api/jobs/driver is not shadowed by GET /api/jobs/:jobId", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("still resolves to getMyJobs (a list), not getJobById (a single job by id 'driver')", async () => {
    const { app, Job } = loadApp({ id: "driver-1", role: "driver" });
    Job.find.mockReturnValueOnce(
      singlePopulatedFind([
        { _id: VALID_JOB_ID, title: "Local delivery", assignedTo: "driver-1" },
      ])
    );

    const res = await request(app).get("/api/jobs/driver");

    expect(res.status).toBe(200);
    // getMyJobs' shape: { status, results, data: [...] } — not getJobById's
    // { status, data: {...} } single-object shape.
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.results).toBe(1);
    // Confirms the request actually reached getMyJobs (Job.find), and never
    // fell through to getJobById (Job.findById with jobId="driver").
    expect(Job.find).toHaveBeenCalledWith({ assignedTo: "driver-1", recordStatus: { $ne: "archived" } });
    expect(Job.findById).not.toHaveBeenCalled();
  });
});
