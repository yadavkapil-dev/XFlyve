// Integration: Authentication, Inactive/archived login rejected, Role
// authorization, Driver ownership. Real Express app (backend/app.js), real
// routes/middleware/controllers, real Mongoose models, against an
// in-memory MongoDB instance (see testDb.js for the isolation guarantee).
process.env.JWT_SECRET = "integration-test-secret";
process.env.RATE_LIMIT_MAX = "10000";
process.env.LOGIN_RATE_LIMIT_MAX = "10000";
process.env.NODE_ENV = "test";

const request = require("supertest");
const { startTestDb, stopTestDb, clearTestDb } = require("./testDb");
const { createDriver, createJob, PASSWORD, authHeader } = require("./factories");

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

describe("Flow: Authentication", () => {
  test("PASS: a driver can log in with the correct email/password and receives a usable token", async () => {
    const driver = await createDriver({ role: "driver", email: "auth-driver@example.com" });

    const res = await request(app).post("/api/auth/login").send({ email: driver.email, password: PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("success");
    expect(typeof res.body.token).toBe("string");
    expect(res.body.data).toMatchObject({ role: "driver" });

    // The issued token must actually work against a real protected route.
    // (toAuthUser() deliberately omits email from the profile payload —
    // id/name/role/driverType only — so assert on what's actually returned.)
    const profileRes = await request(app).get("/api/auth/profile").set("Authorization", `Bearer ${res.body.token}`);
    expect(profileRes.status).toBe(200);
    expect(profileRes.body.data).toMatchObject({ name: driver.name, role: "driver" });
  });

  test("PASS: an admin can log in and receives role 'admin'", async () => {
    const admin = await createDriver({ role: "admin", email: "auth-admin@example.com" });

    const res = await request(app).post("/api/auth/login").send({ email: admin.email, password: PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.data.role).toBe("admin");
  });

  test("PASS: wrong password is rejected with 401 and a generic message (no user enumeration)", async () => {
    const driver = await createDriver({ email: "wrongpass@example.com" });

    const res = await request(app).post("/api/auth/login").send({ email: driver.email, password: "not-the-password" });

    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/Invalid credentials/i);
  });

  test("PASS: a non-existent email is rejected with the same 401/message as a wrong password", async () => {
    const res = await request(app).post("/api/auth/login").send({ email: "nobody@example.com", password: "whatever123" });

    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/Invalid credentials/i);
  });

  test("PASS: a protected route with no token is rejected with 401", async () => {
    const res = await request(app).get("/api/auth/profile");
    expect(res.status).toBe(401);
  });

  test("PASS: a protected route with a malformed token is rejected with 401", async () => {
    const res = await request(app).get("/api/auth/profile").set("Authorization", "Bearer not-a-real-jwt");
    expect(res.status).toBe(401);
  });
});

describe("Flow: Inactive/archived login rejected", () => {
  test("PASS: login is rejected (403) for a driver with recordStatus 'inactive'", async () => {
    const driver = await createDriver({ email: "inactive@example.com", recordStatus: "inactive" });

    const res = await request(app).post("/api/auth/login").send({ email: driver.email, password: PASSWORD });

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/inactive/i);
  });

  test("PASS: login is rejected (403) for a driver with recordStatus 'archived'", async () => {
    const driver = await createDriver({ email: "archived@example.com", recordStatus: "archived" });

    const res = await request(app).post("/api/auth/login").send({ email: driver.email, password: PASSWORD });

    expect(res.status).toBe(403);
  });

  test("PASS: login is rejected (403) when active=false even though recordStatus is 'active'", async () => {
    const driver = await createDriver({ email: "deactivated@example.com", active: false });

    const res = await request(app).post("/api/auth/login").send({ email: driver.email, password: PASSWORD });

    expect(res.status).toBe(403);
  });

  test("PASS: a token issued before archival is rejected on the NEXT request once the account is archived", async () => {
    const driver = await createDriver({ email: "goes-inactive@example.com" });
    const loginRes = await request(app).post("/api/auth/login").send({ email: driver.email, password: PASSWORD });
    expect(loginRes.status).toBe(200);
    const { token } = loginRes.body;

    // Token still works right after login.
    const firstProfile = await request(app).get("/api/auth/profile").set("Authorization", `Bearer ${token}`);
    expect(firstProfile.status).toBe(200);

    // Admin archives the account out from under the still-valid token.
    driver.recordStatus = "archived";
    await driver.save();

    const secondProfile = await request(app).get("/api/auth/profile").set("Authorization", `Bearer ${token}`);
    expect(secondProfile.status).toBe(401);
    expect(secondProfile.body.message).toMatch(/inactive or no longer available/i);
  });
});

describe("Flow: Role authorization", () => {
  test("PASS: a driver is denied (403) on an admin-only route (POST /api/jobs/create)", async () => {
    const driver = await createDriver({ role: "driver" });

    const res = await request(app)
      .post("/api/jobs/create")
      .set("Authorization", authHeader(driver))
      .send({ title: "x" });

    expect(res.status).toBe(403);
  });

  test("PASS: an admin is denied (403) on a driver-only route (POST /api/worklogs)", async () => {
    const admin = await createDriver({ role: "admin" });

    const res = await request(app)
      .post("/api/worklogs")
      .set("Authorization", authHeader(admin))
      .send({ date: "2026-08-01" });

    expect(res.status).toBe(403);
  });

  test("PASS: an admin CAN reach an admin-only route (GET /api/admin/drivers)", async () => {
    const admin = await createDriver({ role: "admin" });

    const res = await request(app).get("/api/admin/drivers").set("Authorization", authHeader(admin));

    expect(res.status).toBe(200);
  });
});

describe("Flow: Driver ownership", () => {
  test("PASS: a driver can fetch their own assigned job", async () => {
    const driver = await createDriver({ role: "driver" });
    const job = await createJob({ assignedTo: driver });

    const res = await request(app).get(`/api/jobs/${job._id}`).set("Authorization", authHeader(driver));

    expect(res.status).toBe(200);
    expect(res.body.data._id).toBe(job._id.toString());
  });

  test("PASS: a driver is denied (403) fetching another driver's job", async () => {
    const ownerDriver = await createDriver({ role: "driver" });
    const otherDriver = await createDriver({ role: "driver" });
    const job = await createJob({ assignedTo: ownerDriver });

    const res = await request(app).get(`/api/jobs/${job._id}`).set("Authorization", authHeader(otherDriver));

    expect(res.status).toBe(403);
  });

  test("PASS: an admin can fetch any driver's job regardless of ownership", async () => {
    const ownerDriver = await createDriver({ role: "driver" });
    const admin = await createDriver({ role: "admin" });
    const job = await createJob({ assignedTo: ownerDriver });

    const res = await request(app).get(`/api/jobs/${job._id}`).set("Authorization", authHeader(admin));

    expect(res.status).toBe(200);
  });

  test("PASS: a driver cannot list PODs scoped to another driver's driverId via the URL param", async () => {
    const ownerDriver = await createDriver({ role: "driver" });
    const otherDriver = await createDriver({ role: "driver" });

    const res = await request(app)
      .get(`/api/jobpods/driver/${ownerDriver._id}`)
      .set("Authorization", authHeader(otherDriver));

    expect(res.status).toBe(403);
  });
});
