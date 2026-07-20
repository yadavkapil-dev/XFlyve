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

  const JobPod = { find: jest.fn() };
  jest.doMock("../models/jobPod", () => JobPod);
  jest.doMock("../models/driver", () => ({}));
  jest.doMock("../models/job", () => ({}));
  jest.doMock("../models/truck", () => ({}));
  jest.doMock("../models/dailyWorkLog", () => ({}));
  jest.doMock("../utils/logger", () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));

  return { controller: require("../controllers/adminController"), JobPod };
};

// select()/populate()/lean() chain used by JobPod.find(...) in downloadAllPods.
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

describe("adminController.downloadAllPods", () => {
  let fetchSpy;

  beforeEach(() => {
    fetchSpy = jest.spyOn(global, "fetch");
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("returns 404 with no Cloudinary calls when there are no PODs", async () => {
    const { controller, JobPod } = loadController();
    JobPod.find.mockReturnValueOnce(findChain([]));

    const res = makeResponse();
    await controller.downloadAllPods({}, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test("streams a valid ZIP when every POD fetches successfully", async () => {
    const { controller, JobPod } = loadController();
    JobPod.find.mockReturnValueOnce(
      findChain([
        { fileUrl: "https://cloudinary.example/a.pdf", driverId: { name: "Alice" }, uploadDate: new Date("2026-01-01") },
        { fileUrl: "https://cloudinary.example/b.pdf", driverId: { name: "Bob" }, uploadDate: new Date("2026-01-02") },
      ])
    );
    fetchSpy.mockImplementation(async () => ({ ok: true, body: fakePdfBody("pdf-bytes") }));

    const app = express();
    app.get("/download-all-pods", controller.downloadAllPods);
    const res = await request(app).get("/download-all-pods").buffer(true).parse(rawBinaryParser);

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe("application/zip");
    expect(res.headers["content-disposition"]).toContain("all_pods.zip");
    // ZIP local file header magic number — confirms a real archive was produced.
    expect(res.body.subarray(0, 4)).toEqual(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  test("skips PODs that fail to fetch but still completes a valid ZIP for the rest", async () => {
    const { controller, JobPod } = loadController();
    JobPod.find.mockReturnValueOnce(
      findChain([
        { fileUrl: "https://cloudinary.example/ok.pdf", driverId: { name: "Alice" }, uploadDate: new Date("2026-01-01") },
        { fileUrl: "https://cloudinary.example/missing.pdf", driverId: { name: "Bob" }, uploadDate: new Date("2026-01-02") },
        { fileUrl: "https://cloudinary.example/errors.pdf", driverId: { name: "Cara" }, uploadDate: new Date("2026-01-03") },
      ])
    );
    fetchSpy.mockImplementation(async (url) => {
      if (url.includes("missing")) return { ok: false, body: null };
      if (url.includes("errors")) throw new Error("network error");
      return { ok: true, body: fakePdfBody("pdf-bytes") };
    });

    const app = express();
    app.get("/download-all-pods", controller.downloadAllPods);
    const res = await request(app).get("/download-all-pods").buffer(true).parse(rawBinaryParser);

    // The response still succeeds with a valid archive of whatever did fetch —
    // a single missing/broken Cloudinary file doesn't fail the whole download.
    expect(res.status).toBe(200);
    expect(res.body.subarray(0, 4)).toEqual(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  test("gives each POD a unique filename even when driver+date collide", async () => {
    const { controller, JobPod } = loadController();
    JobPod.find.mockReturnValueOnce(
      findChain([
        { fileUrl: "https://cloudinary.example/a.pdf", driverId: { name: "Alice" }, uploadDate: new Date("2026-01-01") },
        { fileUrl: "https://cloudinary.example/b.pdf", driverId: { name: "Alice" }, uploadDate: new Date("2026-01-01") },
      ])
    );
    fetchSpy.mockImplementation(async () => ({ ok: true, body: fakePdfBody("pdf-bytes") }));

    const app = express();
    app.get("/download-all-pods", controller.downloadAllPods);
    const res = await request(app).get("/download-all-pods");

    expect(res.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});
