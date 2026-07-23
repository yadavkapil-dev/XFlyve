// Integration: truck-assignment conflict detection and the race-condition
// fallback (Phase 7F flagged truckAssignController.js at 11% coverage — this
// closes that gap). Real app, real routes/middleware/controller, real
// Mongoose models, against an isolated in-memory MongoDB (see testDb.js).
process.env.JWT_SECRET = "integration-test-secret";
process.env.RATE_LIMIT_MAX = "10000";
process.env.NODE_ENV = "test";

const request = require("supertest");
const { startTestDb, stopTestDb, clearTestDb } = require("./testDb");
const { createDriver, createTruck, tomorrow, authHeader } = require("./factories");
const TruckAssignment = require("../../models/dailyTruckAssignment");

let app;

beforeAll(async () => {
  await startTestDb();
  app = require("../../app");
}, 30000);

afterEach(async () => {
  jest.restoreAllMocks();
  await clearTestDb();
});

afterAll(async () => {
  await stopTestDb();
});

const assign = (admin, body) =>
  request(app).post("/api/admin/truck-assignments").set("Authorization", authHeader(admin)).send(body);

describe("Flow: truck-assignment conflict detection", () => {
  test("PASS: assigning a truck to a driver for a date succeeds", async () => {
    const admin = await createDriver({ role: "admin" });
    const driver = await createDriver({ role: "driver" });
    const truck = await createTruck();
    const date = tomorrow();

    const res = await assign(admin, { truckId: truck._id.toString(), driverId: driver._id.toString(), date });

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      driverId: driver._id.toString(),
      truckId: truck._id.toString(),
    });
  });

  test("PASS: the same driver cannot be double-booked on the same date, even with a different truck (409)", async () => {
    const admin = await createDriver({ role: "admin" });
    const driver = await createDriver({ role: "driver" });
    const truckA = await createTruck();
    const truckB = await createTruck();
    const date = tomorrow();

    const first = await assign(admin, { truckId: truckA._id.toString(), driverId: driver._id.toString(), date });
    expect(first.status).toBe(201);

    const second = await assign(admin, { truckId: truckB._id.toString(), driverId: driver._id.toString(), date });
    expect(second.status).toBe(409);
    expect(second.body.message).toMatch(/driver already has a truck assignment/i);
  });

  test("PASS: the same truck cannot be double-booked on the same date, even with a different driver (409)", async () => {
    const admin = await createDriver({ role: "admin" });
    const driverA = await createDriver({ role: "driver" });
    const driverB = await createDriver({ role: "driver" });
    const truck = await createTruck();
    const date = tomorrow();

    const first = await assign(admin, { truckId: truck._id.toString(), driverId: driverA._id.toString(), date });
    expect(first.status).toBe(201);

    const second = await assign(admin, { truckId: truck._id.toString(), driverId: driverB._id.toString(), date });
    expect(second.status).toBe(409);
    expect(second.body.message).toMatch(/truck is already assigned to another driver/i);
  });

  test("PASS: a different driver and a different truck on the same date is NOT a conflict", async () => {
    const admin = await createDriver({ role: "admin" });
    const driverA = await createDriver({ role: "driver" });
    const driverB = await createDriver({ role: "driver" });
    const truckA = await createTruck();
    const truckB = await createTruck();
    const date = tomorrow();

    await assign(admin, { truckId: truckA._id.toString(), driverId: driverA._id.toString(), date });
    const res = await assign(admin, { truckId: truckB._id.toString(), driverId: driverB._id.toString(), date });

    expect(res.status).toBe(201);
  });

  test("PASS: the same driver+truck pair on a DIFFERENT date is NOT a conflict (date-scoped, not pair-scoped)", async () => {
    const admin = await createDriver({ role: "admin" });
    const driver = await createDriver({ role: "driver" });
    const truck = await createTruck();

    const today = new Date();
    const dayAfterTomorrow = new Date(today);
    dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 2);
    const laterDate = dayAfterTomorrow.toISOString().slice(0, 10);

    const first = await assign(admin, { truckId: truck._id.toString(), driverId: driver._id.toString(), date: tomorrow() });
    expect(first.status).toBe(201);

    const second = await assign(admin, { truckId: truck._id.toString(), driverId: driver._id.toString(), date: laterDate });
    expect(second.status).toBe(201);
  });

  test("PASS: an out-of-service truck cannot be assigned at all (409, before any conflict check)", async () => {
    const admin = await createDriver({ role: "admin" });
    const driver = await createDriver({ role: "driver" });
    const truck = await createTruck({ status: "out-of-service" });

    const res = await assign(admin, { truckId: truck._id.toString(), driverId: driver._id.toString(), date: tomorrow() });

    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/not available for assignment/i);
  });
});

describe("Flow: race-condition fallback (concurrent requests both pass the pre-check)", () => {
  test("PASS: a duplicate that slips past the in-app pre-check is still rejected cleanly via the DB's unique index (409, not 500)", async () => {
    const admin = await createDriver({ role: "admin" });
    const driver = await createDriver({ role: "driver" });
    const existingTruck = await createTruck();
    const incomingTruck = await createTruck();
    const date = tomorrow();

    // Simulate the losing half of a real race: another request's assignment
    // for this same driver+date has already committed to the DB...
    await TruckAssignment.create({
      driverId: driver._id,
      truckId: existingTruck._id,
      date: new Date(`${date}T00:00:00.000Z`),
    });

    // ...but force this request's own pre-check (findAssignmentConflict's
    // two Promise.all'd findOne(...).lean() calls) to see "no conflict",
    // exactly as it would if both requests' pre-checks ran before either
    // had saved. findOne() itself returns a chainable query (not a
    // Promise) here, since the controller calls .lean() on it before
    // awaiting.
    const noConflict = { lean: () => Promise.resolve(null) };
    jest.spyOn(TruckAssignment, "findOne")
      .mockReturnValueOnce(noConflict)
      .mockReturnValueOnce(noConflict);

    const res = await assign(admin, { truckId: incomingTruck._id.toString(), driverId: driver._id.toString(), date });

    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/already has a conflicting assignment/i);

    // The DB itself still has exactly the one, originally-committed record —
    // the race didn't produce a duplicate despite the pre-check being fooled.
    const count = await TruckAssignment.countDocuments({ driverId: driver._id });
    expect(count).toBe(1);
  });
});
