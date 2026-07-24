// Integration: authorization/ownership checks not already covered by
// Phase 7B/7C. auth.integration.test.js and approvalWorkflows.integration
// .test.js already cover job ownership, POD driverId-scoping, admin-only
// vs driver-only routing, and notification ownership — this file extends
// coverage to the two areas that were still gaps: work log / work diary
// cross-driver access, and activity access (admin-only, untested via a
// real HTTP request through the real role middleware). Real app, real
// routes/middleware/controllers, against an isolated in-memory MongoDB.
process.env.JWT_SECRET = "integration-test-secret";
process.env.RATE_LIMIT_MAX = "10000";
process.env.NODE_ENV = "test";

jest.doMock("../../config/cloudinary", () => ({
  uploader: {
    upload_stream: jest.fn((options, callback) => {
      callback(null, { secure_url: "https://example.com/fake.pdf", public_id: `fake/${Date.now()}` });
      return {};
    }),
    destroy: jest.fn().mockResolvedValue({ result: "ok" }),
  },
}));

const request = require("supertest");
const { startTestDb, stopTestDb, clearTestDb } = require("./testDb");
const { createDriver, createTruck, createJob, tomorrow, authHeader } = require("./factories");

let app;

beforeAll(async () => {
  await startTestDb();
  app = require("../../app");
}, 30000);

afterEach(async () => {
  await clearTestDb();
});

afterAll(async () => {
  await stopTestDb();
});

const fakePdf = () => Buffer.from("%PDF-1.4 fake content");

describe("Flow: work-log ownership", () => {
  const createLogForDriver = async (driver) => {
    const job = await createJob({ assignedTo: driver, jobType: "local" });
    const res = await request(app)
      .post("/api/worklogs")
      .set("Authorization", authHeader(driver))
      .send({
        date: tomorrow(),
        jobId: job._id.toString(),
        localStartTime: "08:00",
        localEndTime: "16:00",
        hours: 8,
        deliveriesDone: 5,
      });
    expect(res.status).toBe(201);
    return res.body.data._id;
  };

  test("PASS: a driver cannot list another driver's work logs via GET /api/worklogs/:driverId (403)", async () => {
    const driverA = await createDriver({ role: "driver" });
    const driverB = await createDriver({ role: "driver" });
    await createLogForDriver(driverA);

    const res = await request(app)
      .get(`/api/worklogs/${driverA._id}`)
      .set("Authorization", authHeader(driverB));

    expect(res.status).toBe(403);
  });

  test("PASS: a driver cannot update another driver's work log (403)", async () => {
    const driverA = await createDriver({ role: "driver" });
    const driverB = await createDriver({ role: "driver" });
    const logId = await createLogForDriver(driverA);

    const res = await request(app)
      .put(`/api/worklogs/${logId}`)
      .set("Authorization", authHeader(driverB))
      .send({ notes: "tampering with someone else's log" });

    expect(res.status).toBe(403);
  });

  test("PASS: a driver cannot delete another driver's work log (403)", async () => {
    const driverA = await createDriver({ role: "driver" });
    const driverB = await createDriver({ role: "driver" });
    const logId = await createLogForDriver(driverA);

    const res = await request(app)
      .delete(`/api/worklogs/${logId}`)
      .set("Authorization", authHeader(driverB));

    expect(res.status).toBe(403);
  });
});

describe("Flow: work-diary ownership", () => {
  const createDiaryForDriver = async (driver) => {
    const job = await createJob({ assignedTo: driver, jobType: "interstate" });
    const res = await request(app)
      .post("/api/workDiaries/upload")
      .set("Authorization", authHeader(driver))
      .field("jobId", job._id.toString())
      .attach("workDiaryFile", fakePdf(), { filename: "diary.pdf", contentType: "application/pdf" });
    expect(res.status).toBe(201);
    return res.body.data._id;
  };

  test("PASS: a driver cannot fetch another driver's work diary by ID (403)", async () => {
    const driverA = await createDriver({ role: "driver" });
    const driverB = await createDriver({ role: "driver" });
    const diaryId = await createDiaryForDriver(driverA);

    const res = await request(app)
      .get(`/api/workDiaries/${diaryId}`)
      .set("Authorization", authHeader(driverB));

    expect(res.status).toBe(403);
  });

  test("PASS: a driver cannot list another driver's work diaries via the driverId param (403)", async () => {
    const driverA = await createDriver({ role: "driver" });
    const driverB = await createDriver({ role: "driver" });
    await createDiaryForDriver(driverA);

    const res = await request(app)
      .get(`/api/workDiaries/driver/${driverA._id}`)
      .set("Authorization", authHeader(driverB));

    expect(res.status).toBe(403);
  });

  test("PASS: a driver cannot edit another driver's work diary notes (403)", async () => {
    const driverA = await createDriver({ role: "driver" });
    const driverB = await createDriver({ role: "driver" });
    const diaryId = await createDiaryForDriver(driverA);

    const res = await request(app)
      .put(`/api/workDiaries/${diaryId}`)
      .set("Authorization", authHeader(driverB))
      .send({ notes: "tampering with someone else's diary" });

    expect(res.status).toBe(403);
  });

  test("PASS: a driver cannot delete another driver's work diary (403)", async () => {
    const driverA = await createDriver({ role: "driver" });
    const driverB = await createDriver({ role: "driver" });
    const diaryId = await createDiaryForDriver(driverA);

    const res = await request(app)
      .delete(`/api/workDiaries/${diaryId}`)
      .set("Authorization", authHeader(driverB));

    expect(res.status).toBe(403);
  });
});

describe("Flow: activity access is admin-only", () => {
  test("PASS: a driver is denied (403) fetching a job's activity timeline, even for their own job", async () => {
    const driver = await createDriver({ role: "driver" });
    const job = await createJob({ assignedTo: driver });

    const res = await request(app)
      .get(`/api/activities/job/${job._id}`)
      .set("Authorization", authHeader(driver));

    expect(res.status).toBe(403);
  });
});
