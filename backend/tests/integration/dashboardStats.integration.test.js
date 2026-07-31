// Integration: GET /api/admin/dashboard-stats, Phase 11's new fields.
// dashboardStats.test.js already unit-tests the controller's logic against
// mocked models — this file instead seeds REAL documents into an isolated
// in-memory MongoDB and asserts the real aggregation pipelines return the
// right numbers, since a mocked unit test can't catch a genuinely broken
// $group/$match stage. Real app, real routes, against testDb.js's
// mongodb-memory-server instance — never a real Atlas connection.
process.env.JWT_SECRET = "integration-test-secret";
process.env.RATE_LIMIT_MAX = "10000";
process.env.NODE_ENV = "test";

const request = require("supertest");
const { startTestDb, stopTestDb, clearTestDb } = require("./testDb");
const { createDriver, createTruck, createJob, authHeader } = require("./factories");
const JobPod = require("../../models/jobPod");
const DailyWorkLog = require("../../models/dailyWorkLog");

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

const todayIso = () => new Date().toISOString().slice(0, 10);

describe("Flow: dashboard-stats Phase 11 metrics, against real seeded data", () => {
  test("PASS: invoiceReadyJobs matches the number of jobs actually ready to invoice", async () => {
    const admin = await createDriver({ role: "admin" });
    const driver = await createDriver({ role: "driver" });

    // Ready: completed local job with an approved POD linked via jobId —
    // Job.hasApprovedPod() matches on JobPod.jobId directly, no need to
    // also populate the job's own podIds array.
    const readyJob = await createJob({ assignedTo: driver, jobType: "local", status: "completed", jobDate: todayIso() });
    await JobPod.create({ driverId: driver._id, jobId: readyJob._id, fileUrl: "https://example.com/a.pdf", status: "approved" });

    // Not ready: completed local job with no POD at all.
    await createJob({ assignedTo: driver, jobType: "local", status: "completed", jobDate: todayIso() });

    const res = await request(app).get("/api/admin/dashboard-stats").set("Authorization", authHeader(admin));

    expect(res.status).toBe(200);
    expect(res.body.data.invoiceReadyJobs).toBe(1);
  });

  test("PASS: pendingPodApprovals matches the real pending count, excluding approved/rejected", async () => {
    const admin = await createDriver({ role: "admin" });
    const driver = await createDriver({ role: "driver" });

    await JobPod.create({ driverId: driver._id, fileUrl: "https://example.com/a.pdf", status: "pending" });
    await JobPod.create({ driverId: driver._id, fileUrl: "https://example.com/b.pdf", status: "pending" });
    await JobPod.create({ driverId: driver._id, fileUrl: "https://example.com/c.pdf", status: "approved" });

    const res = await request(app).get("/api/admin/dashboard-stats").set("Authorization", authHeader(admin));

    expect(res.status).toBe(200);
    expect(res.body.data.pendingPodApprovals).toBe(2);
  });

  test("PASS: podApprovalRate reflects real approved/rejected counts and is null with no decided PODs", async () => {
    const admin = await createDriver({ role: "admin" });

    const noneDecidedRes = await request(app).get("/api/admin/dashboard-stats").set("Authorization", authHeader(admin));
    expect(noneDecidedRes.body.data.podApprovalRate).toBeNull();

    const driver = await createDriver({ role: "driver" });
    await JobPod.create({ driverId: driver._id, fileUrl: "https://example.com/a.pdf", status: "approved" });
    await JobPod.create({ driverId: driver._id, fileUrl: "https://example.com/b.pdf", status: "approved" });
    await JobPod.create({ driverId: driver._id, fileUrl: "https://example.com/c.pdf", status: "approved" });
    await JobPod.create({ driverId: driver._id, fileUrl: "https://example.com/d.pdf", status: "rejected" });

    const res = await request(app).get("/api/admin/dashboard-stats").set("Authorization", authHeader(admin));
    expect(res.body.data.podApprovalRate).toBe(75); // 3 approved / 4 decided
  });

  test("PASS: truckStatusBreakdown matches real Truck.status counts, excluding archived trucks", async () => {
    const admin = await createDriver({ role: "admin" });

    await createTruck({ status: "available" });
    await createTruck({ status: "available" });
    await createTruck({ status: "out-of-service" });
    const archivedTruck = await createTruck({ status: "available" });
    await require("../../models/truck").updateOne({ _id: archivedTruck._id }, { recordStatus: "archived" });

    const res = await request(app).get("/api/admin/dashboard-stats").set("Authorization", authHeader(admin));

    expect(res.status).toBe(200);
    expect(res.body.data.truckStatusBreakdown).toEqual({ available: 2, "on-route": 0, "out-of-service": 1 });
  });

  test("PASS: jobsByStatus counts all non-archived jobs regardless of date, unlike todaysJobs/pendingJobs", async () => {
    const admin = await createDriver({ role: "admin" });
    const driver = await createDriver({ role: "driver" });

    const farFutureDate = new Date();
    farFutureDate.setDate(farFutureDate.getDate() + 60);
    const farFutureIso = farFutureDate.toISOString().slice(0, 10);

    await createJob({ assignedTo: driver, status: "pending", jobDate: farFutureIso });
    await createJob({ assignedTo: driver, status: "completed", jobDate: farFutureIso });

    const res = await request(app).get("/api/admin/dashboard-stats").set("Authorization", authHeader(admin));

    expect(res.status).toBe(200);
    // Neither job is scheduled for "today", so todaysJobs/pendingJobs (both
    // date-scoped) should NOT count them...
    expect(res.body.data.todaysJobs).toBe(0);
    // ...but jobsByStatus (all-time) should.
    expect(res.body.data.jobsByStatus).toEqual({ pending: 1, "in-progress": 0, completed: 1 });
  });

  test("PASS: jobVolumeTrend's today entry matches the real count of jobs scheduled today", async () => {
    const admin = await createDriver({ role: "admin" });
    const driver = await createDriver({ role: "driver" });

    await createJob({ assignedTo: driver, jobDate: todayIso() });
    await createJob({ assignedTo: driver, jobDate: todayIso() });

    const res = await request(app).get("/api/admin/dashboard-stats").set("Authorization", authHeader(admin));

    expect(res.status).toBe(200);
    const trend = res.body.data.jobVolumeTrend;
    expect(trend).toHaveLength(14);
    const todayEntry = trend.find((d) => d.date === todayIso());
    expect(todayEntry.count).toBe(2);
  });

  test("PASS: admin accounts are never counted in totalDrivers or missingWorkLogs — Driver and admin share one collection", async () => {
    const admin = await createDriver({ role: "admin" });
    // A second admin, to make sure it's a genuine role filter and not just
    // "excludes the caller".
    await createDriver({ role: "admin" });
    const driverWithLog = await createDriver({ role: "driver" });
    await createDriver({ role: "driver" }); // has no log today -> the "1 missing" driver

    await DailyWorkLog.create({
      driverId: driverWithLog._id,
      date: new Date(),
      workDate: new Date(),
    });

    const res = await request(app).get("/api/admin/dashboard-stats").set("Authorization", authHeader(admin));

    expect(res.status).toBe(200);
    // 2 real drivers seeded, not 4 (which is what it'd be if the 2 admins
    // were counted too).
    expect(res.body.data.totalDrivers).toBe(2);
    // 1 of the 2 drivers logged today -> exactly 1 missing, not -1 or 3,
    // either of which would mean admins leaked into one side of the
    // subtraction but not the other.
    expect(res.body.data.missingWorkLogs).toBe(1);
  });
});
