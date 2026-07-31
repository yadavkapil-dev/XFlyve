// Integration: GET /api/admin/download-work-diaries, against a real
// MongoDB query (not a mocked WorkDiary.find) — proves the fixed query
// shape actually matches documents the way Mongo evaluates it, not just
// that the controller builds an object that looks right. Real app, real
// routes/middleware/controller, real Mongoose models, against an isolated
// in-memory MongoDB (see testDb.js). The ONE thing not real is fetching the
// PDF bytes from Cloudinary — that's stubbed via global.fetch, same
// boundary already stubbed in every other download-ZIP test in this suite.
process.env.JWT_SECRET = "integration-test-secret";
process.env.RATE_LIMIT_MAX = "10000";
process.env.NODE_ENV = "test";

const request = require("supertest");
const { ReadableStream } = require("stream/web");
const { startTestDb, stopTestDb, clearTestDb } = require("./testDb");
const { createDriver, authHeader } = require("./factories");
const WorkDiary = require("../../models/workDiary");

const fakePdfBody = () =>
  new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode("pdf-bytes"));
      controller.close();
    },
  });

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

describe("Flow: download-work-diaries is scoped by workDate, falling back to uploadDate only when workDate is null", () => {
  test("PASS: a diary uploaded Wednesday for a Monday trip (workDate=Monday, uploadDate=Wednesday) IS included in a Monday-only range request", async () => {
    const admin = await createDriver({ role: "admin" });
    const driver = await createDriver({ role: "driver", name: "Alice" });

    await WorkDiary.create({
      driverId: driver._id,
      fileUrl: "https://cloudinary.example/monday-trip.pdf",
      workDate: new Date("2026-07-06T00:00:00.000Z"), // Monday — the actual trip day
      uploadDate: new Date("2026-07-08T00:00:00.000Z"), // Wednesday — uploaded late
    });

    global.fetch = jest.fn().mockResolvedValue({ ok: true, body: fakePdfBody() });

    const res = await request(app)
      .get("/api/admin/download-work-diaries")
      .set("Authorization", authHeader(admin))
      // A range covering only the Monday trip date — would 404 (nothing
      // found) if the query still filtered on uploadDate (Wednesday).
      .query({ dateFrom: "2026-07-06", dateTo: "2026-07-06" })
      .buffer(true)
      .parse((response, callback) => {
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => callback(null, Buffer.concat(chunks)));
      });

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe("application/zip");
    // ZIP local file header magic number — confirms a real archive came back.
    expect(res.body.subarray(0, 4)).toEqual(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
  });

  test("PASS: the same diary is correctly EXCLUDED from a range that covers only its (irrelevant) upload date", async () => {
    const admin = await createDriver({ role: "admin" });
    const driver = await createDriver({ role: "driver", name: "Alice" });

    await WorkDiary.create({
      driverId: driver._id,
      fileUrl: "https://cloudinary.example/monday-trip.pdf",
      workDate: new Date("2026-07-06T00:00:00.000Z"),
      uploadDate: new Date("2026-07-08T00:00:00.000Z"),
    });

    const res = await request(app)
      .get("/api/admin/download-work-diaries")
      .set("Authorization", authHeader(admin))
      // Wednesday-only range — the trip itself was Monday, so this must
      // NOT match (proves the fix isn't just "match on either date always").
      .query({ dateFrom: "2026-07-08", dateTo: "2026-07-08" });

    expect(res.status).toBe(404);
  });

  test("PASS: a legacy diary with no workDate at all still falls back to matching on uploadDate", async () => {
    const admin = await createDriver({ role: "admin" });
    const driver = await createDriver({ role: "driver", name: "Legacy" });

    await WorkDiary.create({
      driverId: driver._id,
      fileUrl: "https://cloudinary.example/legacy.pdf",
      uploadDate: new Date("2026-06-01T00:00:00.000Z"),
      // workDate intentionally omitted — defaults to null, per schema.
    });

    global.fetch = jest.fn().mockResolvedValue({ ok: true, body: fakePdfBody() });

    const res = await request(app)
      .get("/api/admin/download-work-diaries")
      .set("Authorization", authHeader(admin))
      .query({ dateFrom: "2026-06-01", dateTo: "2026-06-01" })
      .buffer(true)
      .parse((response, callback) => {
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => callback(null, Buffer.concat(chunks)));
      });

    expect(res.status).toBe(200);
    expect(res.body.subarray(0, 4)).toEqual(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
  });
});
