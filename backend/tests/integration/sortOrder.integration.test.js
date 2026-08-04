// Integration: newest-first sort order for every list endpoint touched by
// the site-wide "most recent first" sort audit — against a real MongoDB
// (see testDb.js), proving actual returned array order, not just that a
// .sort() call happened to be made with the right argument.
process.env.JWT_SECRET = "integration-test-secret";
process.env.NODE_ENV = "test";

const request = require("supertest");
const { startTestDb, stopTestDb, clearTestDb } = require("./testDb");
const { createDriver, createTruck, authHeader } = require("./factories");
const Job = require("../../models/job");
const JobPod = require("../../models/jobPod");
const DailyWorkLog = require("../../models/dailyWorkLog");
const DailyTruckAssignment = require("../../models/dailyTruckAssignment");

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

const approvedPodFor = (job, driver) =>
  JobPod.create({
    driverId: driver._id,
    jobId: job._id,
    fileUrl: "https://cloudinary.example/pod.pdf",
    status: "approved",
  });

describe("Flow: newest-first sort order", () => {
  test("PASS: GET /api/jobs/driver (getMyJobs) returns the driver's own jobs newest jobDate first", async () => {
    const driver = await createDriver({ role: "driver" });
    const truck = await createTruck();

    const older = await Job.create({
      title: "Older job", pickupLocation: "A", deliveryLocation: "B",
      assignedTo: driver._id, assignedTruck: truck._id,
      jobDate: "2026-07-01", jobType: "local", status: "pending",
    });
    const newer = await Job.create({
      title: "Newer job", pickupLocation: "A", deliveryLocation: "B",
      assignedTo: driver._id, assignedTruck: truck._id,
      jobDate: "2026-07-15", jobType: "local", status: "pending",
    });

    const res = await request(app).get("/api/jobs/driver").set("Authorization", authHeader(driver));

    expect(res.status).toBe(200);
    expect(res.body.data.map((j) => j._id)).toEqual([newer._id.toString(), older._id.toString()]);
  });

  test("PASS: GET /api/jobs/assigned/:driverId (getAssignedJobs) returns jobs newest jobDate first", async () => {
    // Note: this route's own ownership check has an "admin OR self" branch,
    // but requireDriver is applied first and 403s any non-driver role
    // (including admin) before that check ever runs — so only the owning
    // driver's own token can actually reach this route today. Using the
    // driver's own token here reflects real reachable behavior.
    const driver = await createDriver({ role: "driver" });
    const truck = await createTruck();

    const older = await Job.create({
      title: "Older job", pickupLocation: "A", deliveryLocation: "B",
      assignedTo: driver._id, assignedTruck: truck._id,
      jobDate: "2026-07-01", jobType: "local", status: "pending",
    });
    const newer = await Job.create({
      title: "Newer job", pickupLocation: "A", deliveryLocation: "B",
      assignedTo: driver._id, assignedTruck: truck._id,
      jobDate: "2026-07-15", jobType: "local", status: "pending",
    });

    const res = await request(app)
      .get(`/api/jobs/assigned/${driver._id}`)
      .set("Authorization", authHeader(driver));

    expect(res.status).toBe(200);
    expect(res.body.data.map((j) => j._id)).toEqual([newer._id.toString(), older._id.toString()]);
  });

  test("PASS: GET /api/worklogs/me (getMyLogs) returns the driver's own logs newest workDate first", async () => {
    const driver = await createDriver({ role: "driver" });

    const older = await DailyWorkLog.create({ driverId: driver._id, date: new Date("2026-07-01") });
    const newer = await DailyWorkLog.create({ driverId: driver._id, date: new Date("2026-07-15") });

    const res = await request(app).get("/api/worklogs/me").set("Authorization", authHeader(driver));

    expect(res.status).toBe(200);
    expect(res.body.data.map((l) => l._id)).toEqual([newer._id.toString(), older._id.toString()]);
  });

  test("PASS: GET /api/worklogs/:driverId (getLogsByDriver) returns logs newest workDate first", async () => {
    const driver = await createDriver({ role: "driver" });

    const older = await DailyWorkLog.create({ driverId: driver._id, date: new Date("2026-07-01") });
    const newer = await DailyWorkLog.create({ driverId: driver._id, date: new Date("2026-07-15") });

    const res = await request(app)
      .get(`/api/worklogs/${driver._id}`)
      .set("Authorization", authHeader(driver));

    expect(res.status).toBe(200);
    expect(res.body.data.map((l) => l._id)).toEqual([newer._id.toString(), older._id.toString()]);
  });

  test("PASS: GET /api/admin/truck-assignments (getAllAssignments) returns assignments newest date first", async () => {
    const admin = await createDriver({ role: "admin" });
    const driverA = await createDriver({ role: "driver" });
    const driverB = await createDriver({ role: "driver" });
    const truckA = await createTruck();
    const truckB = await createTruck();

    const older = await DailyTruckAssignment.create({
      driverId: driverA._id, truckId: truckA._id, date: new Date("2026-07-01"),
    });
    const newer = await DailyTruckAssignment.create({
      driverId: driverB._id, truckId: truckB._id, date: new Date("2026-07-15"),
    });

    const res = await request(app)
      .get("/api/admin/truck-assignments")
      .set("Authorization", authHeader(admin));

    expect(res.status).toBe(200);
    expect(res.body.data.map((a) => a._id)).toEqual([newer._id.toString(), older._id.toString()]);
  });

  test("PASS: GET /api/jobs/admin/ready-for-invoicing (findReadyForInvoicing) returns jobs newest completedAt first", async () => {
    const admin = await createDriver({ role: "admin" });
    const driver = await createDriver({ role: "driver" });
    const truck = await createTruck();

    const olderCompleted = await Job.create({
      title: "Completed earlier", pickupLocation: "A", deliveryLocation: "B",
      assignedTo: driver._id, assignedTruck: truck._id,
      jobDate: "2026-07-01", jobType: "local", status: "completed",
      completedAt: new Date("2026-07-02T00:00:00.000Z"),
    });
    const newerCompleted = await Job.create({
      title: "Completed later", pickupLocation: "A", deliveryLocation: "B",
      assignedTo: driver._id, assignedTruck: truck._id,
      jobDate: "2026-07-10", jobType: "local", status: "completed",
      completedAt: new Date("2026-07-16T00:00:00.000Z"),
    });
    await approvedPodFor(olderCompleted, driver);
    await approvedPodFor(newerCompleted, driver);

    const res = await request(app)
      .get("/api/jobs/admin/ready-for-invoicing")
      .set("Authorization", authHeader(admin));

    expect(res.status).toBe(200);
    expect(res.body.data.map((j) => j._id)).toEqual([
      newerCompleted._id.toString(),
      olderCompleted._id.toString(),
    ]);
  });
});
