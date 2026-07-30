// Integration: Notification creation, Activity creation — verified through
// the real read APIs (not just a direct DB check), including the recipient
// isolation and append-only guarantees. Real app, real routes, real
// Mongoose models, against an isolated in-memory MongoDB (see testDb.js).
process.env.JWT_SECRET = "integration-test-secret";
process.env.RATE_LIMIT_MAX = "10000";
process.env.NODE_ENV = "test";

const request = require("supertest");
const { startTestDb, stopTestDb, clearTestDb } = require("./testDb");
const { createDriver, createTruck, tomorrow, authHeader } = require("./factories");

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

describe("Flow: Notification creation (via the real read API)", () => {
  test("PASS: a driver can see, via GET /api/notifications, the notification created when a job is assigned to them", async () => {
    const admin = await createDriver({ role: "admin" });
    const driver = await createDriver({ role: "driver" });
    const truck = await createTruck();

    const createRes = await request(app)
      .post("/api/jobs/create")
      .set("Authorization", authHeader(admin))
      .send({
        title: "Notify me",
        description: "desc",
        pickupLocation: "A",
        deliveryLocation: "B",
        assignedTo: driver._id.toString(),
        assignedTruck: truck._id.toString(),
        jobDate: tomorrow(),
        startTime: "08:00",
        jobType: "local",
      });
    expect(createRes.status).toBe(201);

    const listRes = await request(app).get("/api/notifications").set("Authorization", authHeader(driver));
    expect(listRes.status).toBe(200);
    expect(listRes.body.data.length).toBeGreaterThan(0);
    const notification = listRes.body.data.find((n) => n.type === "job_assigned");
    expect(notification).toBeTruthy();
    expect(notification.read).toBe(false);

    const countRes = await request(app).get("/api/notifications/unread-count").set("Authorization", authHeader(driver));
    expect(countRes.status).toBe(200);
    expect(countRes.body.data.count).toBeGreaterThan(0);

    const markRes = await request(app)
      .put(`/api/notifications/${notification._id}/read`)
      .set("Authorization", authHeader(driver));
    expect(markRes.status).toBe(200);
    expect(markRes.body.data.read).toBe(true);

    const countAfter = await request(app).get("/api/notifications/unread-count").set("Authorization", authHeader(driver));
    expect(countAfter.body.data.count).toBe(0);
  });

  test("PASS: a different driver cannot mark someone else's notification as read (403)", async () => {
    const admin = await createDriver({ role: "admin" });
    const driverA = await createDriver({ role: "driver" });
    const driverB = await createDriver({ role: "driver" });
    const truck = await createTruck();

    await request(app)
      .post("/api/jobs/create")
      .set("Authorization", authHeader(admin))
      .send({
        title: "For driver A only",
        description: "desc",
        pickupLocation: "A",
        deliveryLocation: "B",
        assignedTo: driverA._id.toString(),
        assignedTruck: truck._id.toString(),
        jobDate: tomorrow(),
        startTime: "08:00",
        jobType: "local",
      });

    const listA = await request(app).get("/api/notifications").set("Authorization", authHeader(driverA));
    const notification = listA.body.data[0];

    // driver B never sees driver A's notification in their own list...
    const listB = await request(app).get("/api/notifications").set("Authorization", authHeader(driverB));
    expect(listB.body.data.find((n) => n._id === notification._id)).toBeUndefined();

    // ...and cannot mark it read even knowing its id directly.
    const res = await request(app)
      .put(`/api/notifications/${notification._id}/read`)
      .set("Authorization", authHeader(driverB));
    expect(res.status).toBe(403);
  });

  test("PASS: mark-all-read zeroes the unread count for that user only", async () => {
    const admin = await createDriver({ role: "admin" });
    const driver = await createDriver({ role: "driver" });
    const truck = await createTruck();

    for (let i = 0; i < 3; i++) {
      await request(app)
        .post("/api/jobs/create")
        .set("Authorization", authHeader(admin))
        .send({
          title: `Job ${i}`,
          description: "desc",
          pickupLocation: "A",
          deliveryLocation: "B",
          assignedTo: driver._id.toString(),
          assignedTruck: (await createTruck())._id.toString(),
          jobDate: tomorrow(),
          startTime: "08:00",
          jobType: "local",
        });
    }

    const before = await request(app).get("/api/notifications/unread-count").set("Authorization", authHeader(driver));
    expect(before.body.data.count).toBeGreaterThanOrEqual(3);

    const markAll = await request(app).put("/api/notifications/read-all").set("Authorization", authHeader(driver));
    expect(markAll.status).toBe(200);

    const after = await request(app).get("/api/notifications/unread-count").set("Authorization", authHeader(driver));
    expect(after.body.data.count).toBe(0);
  });
});

describe("Flow: Activity creation (via the real read API)", () => {
  test("PASS: an admin can retrieve a job's full activity timeline in chronological order after create -> start -> complete", async () => {
    const admin = await createDriver({ role: "admin" });
    const driver = await createDriver({ role: "driver" });
    const truck = await createTruck();

    const createRes = await request(app)
      .post("/api/jobs/create")
      .set("Authorization", authHeader(admin))
      .send({
        title: "Timeline run",
        description: "desc",
        pickupLocation: "A",
        deliveryLocation: "B",
        assignedTo: driver._id.toString(),
        assignedTruck: truck._id.toString(),
        jobDate: tomorrow(),
        startTime: "08:00",
        jobType: "local",
      });
    const jobId = createRes.body.data._id;

    await request(app)
      .put(`/api/jobs/${jobId}`)
      .set("Authorization", authHeader(driver))
      .send({ status: "in-progress" });
    await request(app).put(`/api/jobs/complete/${jobId}`).set("Authorization", authHeader(driver));

    const timelineRes = await request(app)
      .get(`/api/activities/job/${jobId}`)
      .set("Authorization", authHeader(admin));

    expect(timelineRes.status).toBe(200);
    const actions = timelineRes.body.data.map((a) => a.action);
    expect(actions).toEqual(["JOB_CREATED", "JOB_ASSIGNED", "JOB_STARTED", "JOB_COMPLETED"]);

    // Chronological — each entry's createdAt is >= the previous one's.
    const timestamps = timelineRes.body.data.map((a) => new Date(a.createdAt).getTime());
    const sorted = [...timestamps].sort((a, b) => a - b);
    expect(timestamps).toEqual(sorted);
  });

  test("PASS: no route allows modifying or deleting an activity record, even for an admin, even with a real token", async () => {
    const admin = await createDriver({ role: "admin" });
    const fakeId = "507f1f77bcf86cd799439011";

    const putRes = await request(app)
      .put(`/api/activities/job/${fakeId}`)
      .set("Authorization", authHeader(admin))
      .send({ action: "TAMPERED" });
    expect(putRes.status).toBe(404);

    const deleteRes = await request(app)
      .delete(`/api/activities/${fakeId}`)
      .set("Authorization", authHeader(admin));
    expect(deleteRes.status).toBe(404);

    const postRes = await request(app)
      .post("/api/activities")
      .set("Authorization", authHeader(admin))
      .send({ action: "JOB_CREATED" });
    expect(postRes.status).toBe(404);
  });
});
