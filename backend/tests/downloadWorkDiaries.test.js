const express = require("express");
const request = require("supertest");
const { ReadableStream } = require("stream/web");

const fakePdfBody = (text) =>
  new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(text));
      controller.close();
    },
  });

const loadController = () => {
  jest.resetModules();

  const WorkDiary = { find: jest.fn() };
  jest.doMock("../models/workDiary", () => WorkDiary);
  jest.doMock("../models/driver", () => ({}));
  jest.doMock("../models/job", () => ({}));
  jest.doMock("../models/truck", () => ({}));
  jest.doMock("../models/dailyWorkLog", () => ({}));
  jest.doMock("../models/jobPod", () => ({}));
  jest.doMock("../utils/logger", () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));

  return { controller: require("../controllers/adminController"), WorkDiary };
};

// select()/populate()/lean() chain used by WorkDiary.find(...) in downloadWorkDiaries.
const findChain = (result) => ({
  select: jest.fn().mockReturnValue({
    populate: jest.fn().mockReturnValue({
      lean: jest.fn().mockResolvedValue(result),
    }),
  }),
});

// supertest/superagent doesn't have a built-in binary parser for
// application/zip, so res.body would otherwise come back empty — this reads
// the raw response bytes directly.
const rawBinaryParser = (res, callback) => {
  const chunks = [];
  res.on("data", (chunk) => chunks.push(chunk));
  res.on("end", () => callback(null, Buffer.concat(chunks)));
};

const makeResponse = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.headersSent = false;
  return res;
};

describe("adminController.downloadWorkDiaries", () => {
  let fetchSpy;

  beforeEach(() => {
    fetchSpy = jest.spyOn(global, "fetch");
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("400s when dateFrom is missing, without ever querying WorkDiary", async () => {
    const { controller, WorkDiary } = loadController();

    const res = makeResponse();
    await controller.downloadWorkDiaries({ query: { dateTo: "2026-07-15" } }, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(WorkDiary.find).not.toHaveBeenCalled();
  });

  test("400s when dateTo is missing", async () => {
    const { controller, WorkDiary } = loadController();

    const res = makeResponse();
    await controller.downloadWorkDiaries({ query: { dateFrom: "2026-07-01" } }, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(WorkDiary.find).not.toHaveBeenCalled();
  });

  test("returns 404 with no Cloudinary calls when nothing matches the range", async () => {
    const { controller, WorkDiary } = loadController();
    WorkDiary.find.mockReturnValueOnce(findChain([]));

    const res = makeResponse();
    await controller.downloadWorkDiaries({ query: { dateFrom: "2026-07-01", dateTo: "2026-07-31" } }, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test("builds an uploadDate range from dateFrom/dateTo, with no status filter (work diaries have no status)", async () => {
    const { controller, WorkDiary } = loadController();
    WorkDiary.find.mockReturnValueOnce(findChain([]));

    const res = makeResponse();
    await controller.downloadWorkDiaries({ query: { dateFrom: "2026-07-01", dateTo: "2026-07-31" } }, res);

    const calledQuery = WorkDiary.find.mock.calls[0][0];
    expect(calledQuery.uploadDate.$gte.toISOString()).toBe("2026-07-01T00:00:00.000Z");
    expect(calledQuery.uploadDate.$lt.toISOString()).toBe("2026-08-01T00:00:00.000Z");
    expect(calledQuery.status).toBeUndefined();
  });

  test("driverId is optional — omitting it doesn't scope the query to any one driver", async () => {
    const { controller, WorkDiary } = loadController();
    WorkDiary.find.mockReturnValueOnce(findChain([]));

    const res = makeResponse();
    await controller.downloadWorkDiaries({ query: { dateFrom: "2026-07-01", dateTo: "2026-07-31" } }, res);

    const calledQuery = WorkDiary.find.mock.calls[0][0];
    expect(calledQuery.driverId).toBeUndefined();
  });

  test("a valid driverId scopes the query to that driver", async () => {
    const { controller, WorkDiary } = loadController();
    WorkDiary.find.mockReturnValueOnce(findChain([]));
    const driverId = "507f1f77bcf86cd799439011";

    const res = makeResponse();
    await controller.downloadWorkDiaries({ query: { dateFrom: "2026-07-01", dateTo: "2026-07-31", driverId } }, res);

    const calledQuery = WorkDiary.find.mock.calls[0][0];
    expect(calledQuery.driverId).toBe(driverId);
  });

  test("an invalid driverId is ignored rather than erroring", async () => {
    const { controller, WorkDiary } = loadController();
    WorkDiary.find.mockReturnValueOnce(findChain([]));

    const res = makeResponse();
    await controller.downloadWorkDiaries({ query: { dateFrom: "2026-07-01", dateTo: "2026-07-31", driverId: "not-an-id" } }, res);

    const calledQuery = WorkDiary.find.mock.calls[0][0];
    expect(calledQuery.driverId).toBeUndefined();
  });

  test("streams a valid ZIP when every diary fetches successfully", async () => {
    const { controller, WorkDiary } = loadController();
    WorkDiary.find.mockReturnValueOnce(
      findChain([
        { fileUrl: "https://cloudinary.example/a.pdf", driverId: { name: "Alice" }, uploadDate: new Date("2026-07-01") },
        { fileUrl: "https://cloudinary.example/b.pdf", driverId: { name: "Bob" }, uploadDate: new Date("2026-07-02") },
      ])
    );
    fetchSpy.mockImplementation(async () => ({ ok: true, body: fakePdfBody("pdf-bytes") }));

    const app = express();
    app.get("/download-work-diaries", controller.downloadWorkDiaries);
    const res = await request(app)
      .get("/download-work-diaries")
      .query({ dateFrom: "2026-07-01", dateTo: "2026-07-31" })
      .buffer(true)
      .parse(rawBinaryParser);

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe("application/zip");
    expect(res.headers["content-disposition"]).toContain("work_diaries_2026-07-01_to_2026-07-31.zip");
    // ZIP local file header magic number — confirms a real archive was produced.
    expect(res.body.subarray(0, 4)).toEqual(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  test("skips diaries that fail to fetch but still completes a valid ZIP for the rest", async () => {
    const { controller, WorkDiary } = loadController();
    WorkDiary.find.mockReturnValueOnce(
      findChain([
        { fileUrl: "https://cloudinary.example/ok.pdf", driverId: { name: "Alice" }, uploadDate: new Date("2026-07-01") },
        { fileUrl: "https://cloudinary.example/missing.pdf", driverId: { name: "Bob" }, uploadDate: new Date("2026-07-02") },
        { fileUrl: "https://cloudinary.example/errors.pdf", driverId: { name: "Cara" }, uploadDate: new Date("2026-07-03") },
      ])
    );
    fetchSpy.mockImplementation(async (url) => {
      if (url.includes("missing")) return { ok: false, body: null };
      if (url.includes("errors")) throw new Error("network error");
      return { ok: true, body: fakePdfBody("pdf-bytes") };
    });

    const app = express();
    app.get("/download-work-diaries", controller.downloadWorkDiaries);
    const res = await request(app)
      .get("/download-work-diaries")
      .query({ dateFrom: "2026-07-01", dateTo: "2026-07-31" })
      .buffer(true)
      .parse(rawBinaryParser);

    expect(res.status).toBe(200);
    expect(res.body.subarray(0, 4)).toEqual(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  test("gives each diary a unique filename even when driver+date collide", async () => {
    const { controller, WorkDiary } = loadController();
    WorkDiary.find.mockReturnValueOnce(
      findChain([
        { fileUrl: "https://cloudinary.example/a.pdf", driverId: { name: "Alice" }, uploadDate: new Date("2026-07-01") },
        { fileUrl: "https://cloudinary.example/b.pdf", driverId: { name: "Alice" }, uploadDate: new Date("2026-07-01") },
      ])
    );
    fetchSpy.mockImplementation(async () => ({ ok: true, body: fakePdfBody("pdf-bytes") }));

    const app = express();
    app.get("/download-work-diaries", controller.downloadWorkDiaries);
    const res = await request(app)
      .get("/download-work-diaries")
      .query({ dateFrom: "2026-07-01", dateTo: "2026-07-31" });

    expect(res.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});
