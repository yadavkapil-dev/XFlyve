// Integration: the AI tool layer itself (services/ai/tools/index.js),
// called directly (not through the HTTP route or the AI service loop) —
// real app models, real DB, real role middleware, real controllers. This
// is the ground-truth proof for Phase 14's core security requirement:
// authorization is enforced by the tool layer's own code, structurally
// impossible to route around, not just something a prompt asks the model
// to respect. See tests/integration/aiChat.integration.test.js for the
// full HTTP round-trip version of these same guarantees (with a mocked
// LLM), and tests/aiService.test.js for the tool-dispatch loop itself.
process.env.JWT_SECRET = "integration-test-secret";
process.env.NODE_ENV = "test";

const { startTestDb, stopTestDb, clearTestDb } = require("./testDb");
const { createDriver, createTruck, createJob, tomorrow } = require("./factories");
const JobPod = require("../../models/jobPod");

let tools;

beforeAll(async () => {
  await startTestDb();
  tools = require("../../services/ai/tools");
}, 30000);

afterEach(async () => {
  await clearTestDb();
});

afterAll(async () => {
  await stopTestDb();
});

const today = () => new Date().toISOString().slice(0, 10);

const asUser = (driver) => ({ id: driver._id.toString(), _id: driver._id.toString(), role: driver.role });

describe("getMyJobsToday: ownership is enforced by the query itself, not a parameter", () => {
  test("returns only the calling driver's own job dated today — never another driver's job, even one dated today too", async () => {
    const driverA = await createDriver({ name: "Driver A" });
    const driverB = await createDriver({ name: "Driver B" });
    const truck = await createTruck();

    await createJob({ assignedTo: driverA, assignedTruck: truck, jobDate: today(), title: "Driver A's job today" });
    await createJob({ assignedTo: driverB, assignedTruck: await createTruck(), jobDate: today(), title: "Driver B's job today" });

    const result = await tools.getMyJobsToday(asUser(driverA));

    expect(result.statusCode).toBe(200);
    expect(result.body.data).toHaveLength(1);
    expect(result.body.data[0].title).toBe("Driver A's job today");
  });

  test("excludes the driver's own job when it isn't dated today", async () => {
    const driver = await createDriver();
    const truck = await createTruck();
    await createJob({ assignedTo: driver, assignedTruck: truck, jobDate: tomorrow(), title: "Not today" });

    const result = await tools.getMyJobsToday(asUser(driver));

    expect(result.statusCode).toBe(200);
    expect(result.body.data).toHaveLength(0);
  });

  test("an admin calling this driver-only tool gets the real route's 403, not data", async () => {
    const admin = await createDriver({ role: "admin" });

    const result = await tools.getMyJobsToday(asUser(admin));

    expect(result.statusCode).toBe(403);
    expect(result.body.data).toBeUndefined();
  });
});

describe("getAvailableTrucks: any authenticated role, matches the real route's own access level", () => {
  test("a driver can call it and only sees trucks with status available", async () => {
    const driver = await createDriver();
    await createTruck({ truckNumber: "AVAIL-1", status: "available" });
    await createTruck({ truckNumber: "MAINT-1", status: "maintenance" });

    const result = await tools.getAvailableTrucks(asUser(driver));

    expect(result.statusCode).toBe(200);
    const truckNumbers = result.body.data.map((t) => t.truckNumber);
    expect(truckNumbers).toContain("AVAIL-1");
    expect(truckNumbers).not.toContain("MAINT-1");
  });

  test("an admin can call it too", async () => {
    const admin = await createDriver({ role: "admin" });
    await createTruck({ truckNumber: "AVAIL-2", status: "available" });

    const result = await tools.getAvailableTrucks(asUser(admin));

    expect(result.statusCode).toBe(200);
    expect(result.body.data.some((t) => t.truckNumber === "AVAIL-2")).toBe(true);
  });
});

describe("getPendingPods: admin-only, enforced by the real requireAdmin middleware", () => {
  test("a driver gets a 403, never the pending PODs list", async () => {
    const driver = await createDriver();
    const otherDriver = await createDriver();
    await JobPod.create({ driverId: otherDriver._id, fileUrl: "https://example.com/x.pdf", status: "pending" });

    const result = await tools.getPendingPods(asUser(driver));

    expect(result.statusCode).toBe(403);
    expect(result.body.data).toBeUndefined();
  });

  test("an admin gets the real pending PODs", async () => {
    const admin = await createDriver({ role: "admin" });
    const driver = await createDriver();
    await JobPod.create({ driverId: driver._id, fileUrl: "https://example.com/x.pdf", status: "pending" });

    const result = await tools.getPendingPods(asUser(admin));

    expect(result.statusCode).toBe(200);
    expect(result.body.data).toHaveLength(1);
  });
});

describe("getRejectedDocuments: admin-only, reuses an existing status-filterable endpoint", () => {
  test("a driver gets a 403, never any rejected documents", async () => {
    const driver = await createDriver();

    const result = await tools.getRejectedDocuments(asUser(driver));

    expect(result.statusCode).toBe(403);
    expect(result.body.data).toBeUndefined();
  });

  test("an admin gets rejected PODs, with rejection reasons", async () => {
    const admin = await createDriver({ role: "admin" });
    const driver = await createDriver();

    await JobPod.create({
      driverId: driver._id,
      fileUrl: "https://example.com/x.pdf",
      status: "rejected",
      rejectionReason: "blurry photo",
    });

    const result = await tools.getRejectedDocuments(asUser(admin));

    expect(result.statusCode).toBe(200);
    expect(result.body.data.rejectedPods).toHaveLength(1);
    expect(result.body.data.rejectedPods[0].rejectionReason).toBe("blurry photo");
    expect(result.body.data.rejectedWorkLogs).toBeUndefined();
  });
});

describe("getInvoiceReadyJobs: admin-only", () => {
  test("a driver gets a 403, never invoice-ready jobs", async () => {
    const driver = await createDriver();

    const result = await tools.getInvoiceReadyJobs(asUser(driver));

    expect(result.statusCode).toBe(403);
    expect(result.body.data).toBeUndefined();
  });

  test("an admin gets the real ready-for-invoicing jobs (completed, local, approved POD)", async () => {
    const admin = await createDriver({ role: "admin" });
    const driver = await createDriver();
    const truck = await createTruck();
    const job = await createJob({
      assignedTo: driver,
      assignedTruck: truck,
      jobType: "local",
      status: "completed",
      jobDate: tomorrow(),
    });
    await JobPod.create({ driverId: driver._id, jobId: job._id, fileUrl: "https://example.com/x.pdf", status: "approved" });

    const result = await tools.getInvoiceReadyJobs(asUser(admin));

    expect(result.statusCode).toBe(200);
    expect(result.body.data.some((j) => j._id.toString() === job._id.toString())).toBe(true);
  });
});

describe("getDailyOperationsSummary: admin-only", () => {
  test("a driver gets a 403, never fleet-wide stats", async () => {
    const driver = await createDriver();

    const result = await tools.getDailyOperationsSummary(asUser(driver));

    expect(result.statusCode).toBe(403);
    expect(result.body.data).toBeUndefined();
  });

  test("an admin gets the real dashboard stats payload", async () => {
    const admin = await createDriver({ role: "admin" });

    const result = await tools.getDailyOperationsSummary(asUser(admin));

    expect(result.statusCode).toBe(200);
    expect(result.body.data).toEqual(expect.objectContaining({ totalDrivers: expect.any(Number) }));
  });
});
