const express = require("express");
const request = require("supertest");
const { ReadableStream } = require("stream/web");

const VALID_ID = "507f1f77bcf86cd799439011";

// Builds a minimal WHATWG ReadableStream, matching what the real global
// fetch() would hand back as response.body, so Readable.fromWeb(...) in the
// controllers has something real to pipe.
const fakePdfBody = (text = "fake-pdf-bytes") =>
  new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(text));
      controller.close();
    },
  });

// Auth is tested separately (authMiddleware.test.js) — here we stub req.user
// directly so these tests target only the controller's own logic.
const buildApp = (route, handler, user) => {
  const app = express();
  app.use((req, res, next) => {
    req.user = user;
    next();
  });
  app.get(route, handler);
  return app;
};

describe("jobPodController.getPOD (streaming)", () => {
  let fetchSpy;

  const loadController = () => {
    jest.resetModules();
    const JobPod = { findById: jest.fn() };
    jest.doMock("../models/jobPod", () => JobPod);
    jest.doMock("../models/job", () => ({}));
    jest.doMock("../utils/logger", () => ({ error: jest.fn() }));
    return { controller: require("../controllers/jobPodController"), JobPod };
  };

  beforeEach(() => {
    fetchSpy = jest.spyOn(global, "fetch");
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("streams the PDF with the right headers when the driver owns the POD", async () => {
    const { controller, JobPod } = loadController();
    JobPod.findById.mockResolvedValueOnce({ _id: VALID_ID, driverId: { toString: () => "driver-1" }, fileUrl: "https://cloudinary.example/pod1.pdf" });
    fetchSpy.mockResolvedValueOnce({ ok: true, body: fakePdfBody() });

    const app = buildApp("/pods/:podId", controller.getPOD, { id: "driver-1", role: "driver" });
    const res = await request(app).get(`/pods/${VALID_ID}`);

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe("application/pdf");
    expect(res.headers["content-disposition"]).toContain(`POD-${VALID_ID}.pdf`);
    expect(Buffer.from(res.body).toString()).toBe("fake-pdf-bytes");
    expect(fetchSpy).toHaveBeenCalledWith("https://cloudinary.example/pod1.pdf");
  });

  test("allows an admin to stream any driver's POD", async () => {
    const { controller, JobPod } = loadController();
    JobPod.findById.mockResolvedValueOnce({ _id: VALID_ID, driverId: { toString: () => "some-other-driver" }, fileUrl: "https://cloudinary.example/pod1.pdf" });
    fetchSpy.mockResolvedValueOnce({ ok: true, body: fakePdfBody() });

    const app = buildApp("/pods/:podId", controller.getPOD, { id: "admin-1", role: "admin" });
    const res = await request(app).get(`/pods/${VALID_ID}`);

    expect(res.status).toBe(200);
  });

  test("denies a driver access to another driver's POD without calling Cloudinary", async () => {
    const { controller, JobPod } = loadController();
    JobPod.findById.mockResolvedValueOnce({ _id: VALID_ID, driverId: { toString: () => "someone-else" }, fileUrl: "https://cloudinary.example/pod1.pdf" });

    const app = buildApp("/pods/:podId", controller.getPOD, { id: "driver-1", role: "driver" });
    const res = await request(app).get(`/pods/${VALID_ID}`);

    expect(res.status).toBe(403);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test("returns 404 when the POD does not exist", async () => {
    const { controller, JobPod } = loadController();
    JobPod.findById.mockResolvedValueOnce(null);

    const app = buildApp("/pods/:podId", controller.getPOD, { id: "driver-1", role: "driver" });
    const res = await request(app).get(`/pods/${VALID_ID}`);

    expect(res.status).toBe(404);
  });

  test("returns 400 for a malformed podId", async () => {
    const { controller } = loadController();

    const app = buildApp("/pods/:podId", controller.getPOD, { id: "driver-1", role: "driver" });
    const res = await request(app).get("/pods/not-a-valid-id");

    expect(res.status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test("returns 502 when Cloudinary responds with a non-ok status", async () => {
    const { controller, JobPod } = loadController();
    JobPod.findById.mockResolvedValueOnce({ _id: VALID_ID, driverId: { toString: () => "driver-1" }, fileUrl: "https://cloudinary.example/missing.pdf" });
    fetchSpy.mockResolvedValueOnce({ ok: false, body: null });

    const app = buildApp("/pods/:podId", controller.getPOD, { id: "driver-1", role: "driver" });
    const res = await request(app).get(`/pods/${VALID_ID}`);

    expect(res.status).toBe(502);
  });

  test("returns 502 when Cloudinary resolves ok but with no body", async () => {
    const { controller, JobPod } = loadController();
    JobPod.findById.mockResolvedValueOnce({ _id: VALID_ID, driverId: { toString: () => "driver-1" }, fileUrl: "https://cloudinary.example/pod1.pdf" });
    fetchSpy.mockResolvedValueOnce({ ok: true, body: null });

    const app = buildApp("/pods/:podId", controller.getPOD, { id: "driver-1", role: "driver" });
    const res = await request(app).get(`/pods/${VALID_ID}`);

    expect(res.status).toBe(502);
  });

  test("returns 500 when the Cloudinary fetch itself throws (network error)", async () => {
    const { controller, JobPod } = loadController();
    JobPod.findById.mockResolvedValueOnce({ _id: VALID_ID, driverId: { toString: () => "driver-1" }, fileUrl: "https://cloudinary.example/pod1.pdf" });
    fetchSpy.mockRejectedValueOnce(new Error("network down"));

    const app = buildApp("/pods/:podId", controller.getPOD, { id: "driver-1", role: "driver" });
    const res = await request(app).get(`/pods/${VALID_ID}`);

    expect(res.status).toBe(500);
  });
});

describe("workDiaryController.getWorkDiary (streaming)", () => {
  let fetchSpy;

  const loadController = () => {
    jest.resetModules();
    const WorkDiary = { findById: jest.fn() };
    jest.doMock("../models/workDiary", () => WorkDiary);
    jest.doMock("../models/job", () => ({}));
    jest.doMock("../utils/logger", () => ({ error: jest.fn() }));
    return { controller: require("../controllers/workDiaryController"), WorkDiary };
  };

  beforeEach(() => {
    fetchSpy = jest.spyOn(global, "fetch");
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("streams the PDF with the right headers when the driver owns the work diary", async () => {
    const { controller, WorkDiary } = loadController();
    WorkDiary.findById.mockResolvedValueOnce({ _id: VALID_ID, driverId: { toString: () => "driver-1" }, fileUrl: "https://cloudinary.example/diary1.pdf" });
    fetchSpy.mockResolvedValueOnce({ ok: true, body: fakePdfBody("diary-bytes") });

    const app = buildApp("/diaries/:id", controller.getWorkDiary, { id: "driver-1", role: "driver" });
    const res = await request(app).get(`/diaries/${VALID_ID}`);

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe("application/pdf");
    expect(res.headers["content-disposition"]).toContain(`WorkDiary-${VALID_ID}.pdf`);
    expect(Buffer.from(res.body).toString()).toBe("diary-bytes");
  });

  test("denies a driver access to another driver's work diary without calling Cloudinary", async () => {
    const { controller, WorkDiary } = loadController();
    WorkDiary.findById.mockResolvedValueOnce({ _id: VALID_ID, driverId: { toString: () => "someone-else" }, fileUrl: "https://cloudinary.example/diary1.pdf" });

    const app = buildApp("/diaries/:id", controller.getWorkDiary, { id: "driver-1", role: "driver" });
    const res = await request(app).get(`/diaries/${VALID_ID}`);

    expect(res.status).toBe(403);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test("returns 404 when the work diary does not exist", async () => {
    const { controller, WorkDiary } = loadController();
    WorkDiary.findById.mockResolvedValueOnce(null);

    const app = buildApp("/diaries/:id", controller.getWorkDiary, { id: "driver-1", role: "driver" });
    const res = await request(app).get(`/diaries/${VALID_ID}`);

    expect(res.status).toBe(404);
  });

  test("returns 502 when Cloudinary responds with a non-ok status", async () => {
    const { controller, WorkDiary } = loadController();
    WorkDiary.findById.mockResolvedValueOnce({ _id: VALID_ID, driverId: { toString: () => "driver-1" }, fileUrl: "https://cloudinary.example/missing.pdf" });
    fetchSpy.mockResolvedValueOnce({ ok: false, body: null });

    const app = buildApp("/diaries/:id", controller.getWorkDiary, { id: "driver-1", role: "driver" });
    const res = await request(app).get(`/diaries/${VALID_ID}`);

    expect(res.status).toBe(502);
  });
});
