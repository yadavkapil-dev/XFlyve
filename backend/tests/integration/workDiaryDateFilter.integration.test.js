// Integration: GET /api/workDiaries/driver/:driverId's date-range filter,
// against a real MongoDB query — proves the fixed query shape actually
// matches documents the way Mongo evaluates it, not just that the
// controller builds an object that looks right. This is the same endpoint
// (and same applyDiaryDateFilter logic) used by both the driver's own Work
// Diary history view and the admin WorkDiary.jsx history-list date filter —
// covered here via both a driver auth token and an admin auth token
// hitting the identical route. Real app, real routes/middleware/
// controller, real Mongoose models, against an isolated in-memory MongoDB
// (see testDb.js).
process.env.JWT_SECRET = "integration-test-secret";
process.env.RATE_LIMIT_MAX = "10000";
process.env.NODE_ENV = "test";

const request = require("supertest");
const { startTestDb, stopTestDb, clearTestDb } = require("./testDb");
const { createDriver, authHeader } = require("./factories");
const WorkDiary = require("../../models/workDiary");

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

const seedMondayTripUploadedWednesday = async (driver) =>
  WorkDiary.create({
    driverId: driver._id,
    fileUrl: "https://cloudinary.example/monday-trip.pdf",
    workDate: new Date("2026-07-06T00:00:00.000Z"), // Monday — the actual trip day
    uploadDate: new Date("2026-07-08T00:00:00.000Z"), // Wednesday — uploaded late
  });

describe("Flow: GET /api/workDiaries/driver/:driverId is scoped by workDate, falling back to uploadDate only when workDate is null", () => {
  test("PASS (driver's own history view): a diary uploaded Wednesday for a Monday trip IS included in a Monday-only range request", async () => {
    const driver = await createDriver({ role: "driver" });
    await seedMondayTripUploadedWednesday(driver);

    const res = await request(app)
      .get(`/api/workDiaries/driver/${driver._id}`)
      .set("Authorization", authHeader(driver))
      // A range covering only the Monday trip date — would come back empty
      // if the query still filtered on uploadDate (Wednesday).
      .query({ dateFrom: "2026-07-06", dateTo: "2026-07-06", includeOlder: "true" });

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].fileUrl).toBe("https://cloudinary.example/monday-trip.pdf");
  });

  test("PASS (driver's own history view): the same diary is correctly EXCLUDED from a range covering only its (irrelevant) upload date", async () => {
    const driver = await createDriver({ role: "driver" });
    await seedMondayTripUploadedWednesday(driver);

    const res = await request(app)
      .get(`/api/workDiaries/driver/${driver._id}`)
      .set("Authorization", authHeader(driver))
      // Wednesday-only range — the trip itself was Monday, so this must
      // NOT match (proves the fix isn't just "match on either date always").
      .query({ dateFrom: "2026-07-08", dateTo: "2026-07-08", includeOlder: "true" });

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(0);
  });

  test("PASS (admin's history-list filter, same endpoint/query, different auth role): the Monday-trip diary IS included for an admin's Monday-range request", async () => {
    const admin = await createDriver({ role: "admin" });
    const driver = await createDriver({ role: "driver" });
    await seedMondayTripUploadedWednesday(driver);

    const res = await request(app)
      .get(`/api/workDiaries/driver/${driver._id}`)
      .set("Authorization", authHeader(admin))
      .query({ dateFrom: "2026-07-06", dateTo: "2026-07-06", includeOlder: "true" });

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });

  test("PASS (admin's history-list filter): a legacy diary with no workDate at all still falls back to matching on uploadDate", async () => {
    const admin = await createDriver({ role: "admin" });
    const driver = await createDriver({ role: "driver" });
    await WorkDiary.create({
      driverId: driver._id,
      fileUrl: "https://cloudinary.example/legacy.pdf",
      uploadDate: new Date("2026-06-01T00:00:00.000Z"),
      // workDate intentionally omitted — defaults to null, per schema.
    });

    const res = await request(app)
      .get(`/api/workDiaries/driver/${driver._id}`)
      .set("Authorization", authHeader(admin))
      .query({ dateFrom: "2026-06-01", dateTo: "2026-06-01", includeOlder: "true" });

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].fileUrl).toBe("https://cloudinary.example/legacy.pdf");
  });

  test("PASS: the date-range filter still combines correctly with the default 30-day-cutoff (includeOlder omitted) instead of one $or clobbering the other", async () => {
    const driver = await createDriver({ role: "driver" });
    // Relative to "now" (not a fixed calendar date) so this stays inside
    // the default 30-day cutoff window no matter when the suite runs.
    const workDateOnly = (daysAgo) => {
      const d = new Date();
      d.setUTCDate(d.getUTCDate() - daysAgo);
      return new Date(d.toISOString().slice(0, 10) + "T00:00:00.000Z");
    };
    const tripDate = workDateOnly(5);
    const uploadedTwoDaysLate = workDateOnly(3);
    await WorkDiary.create({
      driverId: driver._id,
      fileUrl: "https://cloudinary.example/recent-trip.pdf",
      workDate: tripDate,
      uploadDate: uploadedTwoDaysLate,
    });

    const res = await request(app)
      .get(`/api/workDiaries/driver/${driver._id}`)
      .set("Authorization", authHeader(driver))
      // No includeOlder param this time — the default 30-day cutoff $or is
      // also in play alongside the workDate-range $or.
      .query({ dateFrom: tripDate.toISOString().slice(0, 10), dateTo: tripDate.toISOString().slice(0, 10) });

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].fileUrl).toBe("https://cloudinary.example/recent-trip.pdf");
  });
});
