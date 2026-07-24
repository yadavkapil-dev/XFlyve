// Integration: Job lifecycle, Truck consistency. Real app, real routes,
// real jobController + jobTransitionService, real Mongoose models, against
// an isolated in-memory MongoDB (see testDb.js).
process.env.JWT_SECRET = "integration-test-secret";
process.env.RATE_LIMIT_MAX = "10000";
process.env.NODE_ENV = "test";

const request = require("supertest");
const { startTestDb, stopTestDb, clearTestDb } = require("./testDb");
const { createDriver, createTruck, createJob, tomorrow, authHeader } = require("./factories");
const Truck = require("../../models/truck");
const Job = require("../../models/job");
const DailyTruckAssignment = require("../../models/dailyTruckAssignment");

const startOfDay = (date) => new Date(date.toISOString().slice(0, 10) + "T00:00:00.000Z");

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

describe("Flow: Job lifecycle", () => {
  test("PASS: admin creates a job -> driver starts it -> driver completes it, end to end through real HTTP", async () => {
    const admin = await createDriver({ role: "admin" });
    const driver = await createDriver({ role: "driver" });
    const truck = await createTruck();

    const createRes = await request(app)
      .post("/api/jobs/create")
      .set("Authorization", authHeader(admin))
      .send({
        title: "Integration lifecycle run",
        description: "Deliver freight",
        pickupLocation: "Depot",
        deliveryLocation: "Customer",
        assignedTo: driver._id.toString(),
        assignedTruck: truck._id.toString(),
        jobDate: tomorrow(),
        jobType: "local",
      });

    expect(createRes.status).toBe(201);
    expect(createRes.body.data.status).toBe("pending");
    const jobId = createRes.body.data._id;

    const startRes = await request(app)
      .put(`/api/jobs/${jobId}`)
      .set("Authorization", authHeader(driver))
      .send({ status: "in-progress" });

    expect(startRes.status).toBe(200);
    expect(startRes.body.data.status).toBe("in-progress");

    const completeRes = await request(app)
      .put(`/api/jobs/complete/${jobId}`)
      .set("Authorization", authHeader(driver));

    expect(completeRes.status).toBe(200);
    expect(completeRes.body.data.status).toBe("completed");

    const persisted = await Job.findById(jobId).lean();
    expect(persisted.status).toBe("completed");
    expect(persisted.startedAt).toBeInstanceOf(Date);
    expect(persisted.completedAt).toBeInstanceOf(Date);
  });

  test("PASS: a job cannot be completed directly from 'pending' (must go through 'in-progress' first)", async () => {
    const driver = await createDriver({ role: "driver" });
    const job = await createJob({ assignedTo: driver, status: "pending" });

    const res = await request(app).put(`/api/jobs/complete/${job._id}`).set("Authorization", authHeader(driver));

    expect(res.status).toBe(409);
  });

  test("PASS: a driver cannot start a job assigned to another driver", async () => {
    const ownerDriver = await createDriver({ role: "driver" });
    const otherDriver = await createDriver({ role: "driver" });
    const job = await createJob({ assignedTo: ownerDriver, status: "pending" });

    const res = await request(app)
      .put(`/api/jobs/${job._id}`)
      .set("Authorization", authHeader(otherDriver))
      .send({ status: "in-progress" });

    expect(res.status).toBe(403);
  });
});

describe("Flow: Truck consistency", () => {
  test("PASS: starting a job flips its truck to 'on-route'; completing it flips the truck back to 'available'", async () => {
    const driver = await createDriver({ role: "driver" });
    const truck = await createTruck({ status: "available" });
    const job = await createJob({ assignedTo: driver, assignedTruck: truck, status: "pending" });

    await request(app)
      .put(`/api/jobs/${job._id}`)
      .set("Authorization", authHeader(driver))
      .send({ status: "in-progress" });

    const midTruck = await Truck.findById(truck._id).lean();
    expect(midTruck.status).toBe("on-route");
    expect(String(midTruck.assignedJob)).toBe(String(job._id));

    await request(app).put(`/api/jobs/complete/${job._id}`).set("Authorization", authHeader(driver));

    const finalTruck = await Truck.findById(truck._id).lean();
    expect(finalTruck.status).toBe("available");
    expect(finalTruck.assignedJob).toBeNull();
  });

  test("PASS: an admin cannot double-book the same truck on the same date (truck-conflict business rule)", async () => {
    const admin = await createDriver({ role: "admin" });
    const driverA = await createDriver({ role: "driver" });
    const driverB = await createDriver({ role: "driver" });
    const truck = await createTruck();
    const sharedDate = tomorrow();

    const firstJob = await createJob({ assignedTo: driverA, assignedTruck: truck, jobDate: sharedDate });
    expect(firstJob.status).toBe("pending");

    const res = await request(app)
      .post("/api/jobs/create")
      .set("Authorization", authHeader(admin))
      .send({
        title: "Conflicting run",
        description: "Same truck, same day",
        pickupLocation: "Depot",
        deliveryLocation: "Customer",
        assignedTo: driverB._id.toString(),
        assignedTruck: truck._id.toString(),
        jobDate: sharedDate,
        jobType: "local",
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/already assigned to another job/i);
  });

  test("PASS: a job cannot be started if its truck is out of service", async () => {
    const driver = await createDriver({ role: "driver" });
    const truck = await createTruck({ status: "out-of-service" });
    const job = await createJob({ assignedTo: driver, assignedTruck: truck, status: "pending" });

    const res = await request(app)
      .put(`/api/jobs/${job._id}`)
      .set("Authorization", authHeader(driver))
      .send({ status: "in-progress" });

    expect(res.status).toBe(409);

    const persistedTruck = await Truck.findById(truck._id).lean();
    expect(persistedTruck.status).toBe("out-of-service"); // unchanged
  });

  test("PASS: two in-progress jobs can never share the same truck at once", async () => {
    const driverA = await createDriver({ role: "driver" });
    const driverB = await createDriver({ role: "driver" });
    const truck = await createTruck({ status: "available" });

    const jobA = await createJob({ assignedTo: driverA, assignedTruck: truck, status: "pending" });
    const jobB = await createJob({ assignedTo: driverB, assignedTruck: truck, status: "pending" });

    const startA = await request(app)
      .put(`/api/jobs/${jobA._id}`)
      .set("Authorization", authHeader(driverA))
      .send({ status: "in-progress" });
    expect(startA.status).toBe(200);

    const startB = await request(app)
      .put(`/api/jobs/${jobB._id}`)
      .set("Authorization", authHeader(driverB))
      .send({ status: "in-progress" });

    expect(startB.status).toBe(409);
  });
});

describe("Flow: truck archival", () => {
  test("PASS: a truck whose only truck-assignment record is in the past can still be archived", async () => {
    const admin = await createDriver({ role: "admin" });
    const driver = await createDriver({ role: "driver" });
    const truck = await createTruck();

    const pastDate = startOfDay(new Date(Date.now() - 10 * 24 * 60 * 60 * 1000));
    await DailyTruckAssignment.create({ truckId: truck._id, driverId: driver._id, date: pastDate });

    const res = await request(app)
      .delete(`/api/admin/trucks/${truck._id}`)
      .set("Authorization", authHeader(admin));

    expect(res.status).toBe(200);
    const persisted = await Truck.findById(truck._id).lean();
    expect(persisted.recordStatus).toBe("archived");
  });

  test("PASS: a truck with a current (today-dated) truck-assignment record cannot be archived (409)", async () => {
    const admin = await createDriver({ role: "admin" });
    const driver = await createDriver({ role: "driver" });
    const truck = await createTruck();

    const todayDate = startOfDay(new Date());
    await DailyTruckAssignment.create({ truckId: truck._id, driverId: driver._id, date: todayDate });

    const res = await request(app)
      .delete(`/api/admin/trucks/${truck._id}`)
      .set("Authorization", authHeader(admin));

    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/referenced by active jobs or assignments/i);

    const persisted = await Truck.findById(truck._id).lean();
    expect(persisted.recordStatus).not.toBe("archived");
  });
});
