// Integration: adminController.js's createDriver (archived-email
// reactivation) and deleteDriver (self-delete guard, active-job guard).
// Phase 7F flagged both as effectively 0% covered. Real app, real
// routes/middleware/controller, real Mongoose models (including the
// password-hashing pre-save hook), against an isolated in-memory MongoDB
// (see testDb.js).
process.env.JWT_SECRET = "integration-test-secret";
process.env.RATE_LIMIT_MAX = "10000";
process.env.LOGIN_RATE_LIMIT_MAX = "10000";
process.env.NODE_ENV = "test";

const request = require("supertest");
const { startTestDb, stopTestDb, clearTestDb } = require("./testDb");
const { createDriver, createJob, PASSWORD, authHeader } = require("./factories");
const Driver = require("../../models/driver");

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

describe("Flow: createDriver — archived-email reactivation", () => {
  test("PASS: creating a driver with an email matching a previously-archived driver reactivates that exact record instead of creating a new one", async () => {
    const admin = await createDriver({ role: "admin" });
    const archived = await createDriver({
      role: "driver",
      email: "reactivate-me@example.com",
      name: "Old Name",
      recordStatus: "archived",
    });
    // deleteDriver's real behavior also flips `active` to false on archive —
    // set that here too so this fixture matches what an actually-archived
    // driver looks like, not just its recordStatus.
    archived.active = false;
    await archived.save();

    const res = await request(app)
      .post("/api/admin/drivers")
      .set("Authorization", authHeader(admin))
      .send({
        name: "New Name",
        email: "reactivate-me@example.com",
        password: "BrandNewPassword1!",
      });

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      name: "New Name",
      recordStatus: "active",
      active: true,
      role: "driver",
    });
    expect(res.body.data.password).toBeUndefined();

    // It's the SAME document reactivated, not a second one created —
    // exactly one driver exists for this email, and it's the original _id.
    const matches = await Driver.find({ email: "reactivate-me@example.com" }).lean();
    expect(matches).toHaveLength(1);
    expect(matches[0]._id.toString()).toBe(archived._id.toString());
    expect(matches[0].name).toBe("New Name");
    expect(matches[0].recordStatus).toBe("active");

    // The password was genuinely overwritten (re-hashed), not left as-is —
    // the OLD password no longer works, the NEW one does.
    const oldLogin = await request(app)
      .post("/api/auth/login")
      .send({ email: "reactivate-me@example.com", password: PASSWORD });
    expect(oldLogin.status).toBe(401);

    const newLogin = await request(app)
      .post("/api/auth/login")
      .send({ email: "reactivate-me@example.com", password: "BrandNewPassword1!" });
    expect(newLogin.status).toBe(200);
  });

  test("PASS: creating a driver with an email already used by a NON-archived driver is rejected (409), not reactivated", async () => {
    const admin = await createDriver({ role: "admin" });
    await createDriver({ role: "driver", email: "still-active@example.com", recordStatus: "active" });

    const res = await request(app)
      .post("/api/admin/drivers")
      .set("Authorization", authHeader(admin))
      .send({ name: "Someone Else", email: "still-active@example.com", password: "AnotherPassword1!" });

    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/already exists/i);

    const matches = await Driver.find({ email: "still-active@example.com" }).lean();
    expect(matches).toHaveLength(1);
    expect(matches[0].name).not.toBe("Someone Else");
  });

  test("PASS: creating a driver with a genuinely new email returns 201 with no reactivated-record payload", async () => {
    const admin = await createDriver({ role: "admin" });

    const res = await request(app)
      .post("/api/admin/drivers")
      .set("Authorization", authHeader(admin))
      .send({ name: "Brand New Driver", email: "brand-new@example.com", password: "SomePassword1!" });

    expect(res.status).toBe(201);
    // Confirmed asymmetry: unlike the reactivation branch, the plain
    // create-new-driver branch returns no `data` field at all.
    expect(res.body.data).toBeUndefined();

    const created = await Driver.findOne({ email: "brand-new@example.com" }).lean();
    expect(created).toBeTruthy();
    expect(created.role).toBe("driver");
  });
});

describe("Flow: deleteDriver — self-delete guard", () => {
  test("PASS: an admin cannot archive their own account (400), and their record is left untouched", async () => {
    const admin = await createDriver({ role: "admin" });

    const res = await request(app)
      .delete(`/api/admin/drivers/${admin._id}`)
      .set("Authorization", authHeader(admin));

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/cannot delete your own admin account/i);

    const persisted = await Driver.findById(admin._id).lean();
    expect(persisted.recordStatus).toBe("active");
    expect(persisted.active).toBe(true);
  });

  test("PASS: one admin CAN archive a different admin's account (the guard is self-only, not admin-role-only)", async () => {
    const adminA = await createDriver({ role: "admin" });
    const adminB = await createDriver({ role: "admin" });

    const res = await request(app)
      .delete(`/api/admin/drivers/${adminB._id}`)
      .set("Authorization", authHeader(adminA));

    expect(res.status).toBe(200);
    const persisted = await Driver.findById(adminB._id).lean();
    expect(persisted.recordStatus).toBe("archived");
  });
});

describe("Flow: deleteDriver — active-job guard", () => {
  test("PASS: a driver with a PENDING job cannot be archived (409), and their record is left untouched", async () => {
    const admin = await createDriver({ role: "admin" });
    const driver = await createDriver({ role: "driver" });
    await createJob({ assignedTo: driver, status: "pending" });

    const res = await request(app)
      .delete(`/api/admin/drivers/${driver._id}`)
      .set("Authorization", authHeader(admin));

    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/active jobs/i);

    const persisted = await Driver.findById(driver._id).lean();
    expect(persisted.recordStatus).toBe("active");
  });

  test("PASS: a driver with an IN-PROGRESS job cannot be archived (409)", async () => {
    const admin = await createDriver({ role: "admin" });
    const driver = await createDriver({ role: "driver" });
    await createJob({ assignedTo: driver, status: "in-progress" });

    const res = await request(app)
      .delete(`/api/admin/drivers/${driver._id}`)
      .set("Authorization", authHeader(admin));

    expect(res.status).toBe(409);
  });

  test("PASS: a driver whose only job is COMPLETED can still be archived (the guard only blocks pending/in-progress)", async () => {
    const admin = await createDriver({ role: "admin" });
    const driver = await createDriver({ role: "driver" });
    await createJob({ assignedTo: driver, status: "completed" });

    const res = await request(app)
      .delete(`/api/admin/drivers/${driver._id}`)
      .set("Authorization", authHeader(admin));

    expect(res.status).toBe(200);
    const persisted = await Driver.findById(driver._id).lean();
    expect(persisted.recordStatus).toBe("archived");
    expect(persisted.active).toBe(false);
  });

  test("PASS: a driver with no jobs at all can be archived normally (200)", async () => {
    const admin = await createDriver({ role: "admin" });
    const driver = await createDriver({ role: "driver" });

    const res = await request(app)
      .delete(`/api/admin/drivers/${driver._id}`)
      .set("Authorization", authHeader(admin));

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/archived/i);
  });
});

describe("Flow: getAllDrivers — admin accounts never appear in the Drivers list", () => {
  test("PASS: GET /api/admin/drivers returns only role:driver accounts, not the admins that share the collection", async () => {
    const admin = await createDriver({ role: "admin" });
    await createDriver({ role: "admin" });
    const driverA = await createDriver({ role: "driver" });
    const driverB = await createDriver({ role: "driver" });

    const res = await request(app)
      .get("/api/admin/drivers")
      .set("Authorization", authHeader(admin));

    expect(res.status).toBe(200);
    expect(res.body.pagination.total).toBe(2);
    const returnedIds = res.body.data.map((d) => d._id).sort();
    expect(returnedIds).toEqual([driverA._id.toString(), driverB._id.toString()].sort());
    expect(res.body.data.every((d) => d.role === "driver")).toBe(true);
  });
});

describe("Flow: getSystemStats — admin accounts never counted in totalDrivers", () => {
  test("PASS: GET /api/admin/stats totalDrivers matches only role:driver accounts", async () => {
    const admin = await createDriver({ role: "admin" });
    await createDriver({ role: "admin" });
    await createDriver({ role: "driver" });
    await createDriver({ role: "driver" });
    await createDriver({ role: "driver" });

    const res = await request(app)
      .get("/api/admin/stats")
      .set("Authorization", authHeader(admin));

    expect(res.status).toBe(200);
    // 3 real drivers seeded, not 5 (which is what it'd be if the 2 admins
    // were counted too).
    expect(res.body.data.totalDrivers).toBe(3);
  });
});
