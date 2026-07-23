const makeResponse = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

const findChain = (result) => {
  const chain = {
    sort: jest.fn(() => chain),
    populate: jest.fn(() => chain),
    lean: jest.fn().mockResolvedValue(result),
  };
  return chain;
};

const loadController = () => {
  jest.resetModules();

  const Activity = { find: jest.fn() };
  jest.doMock("../models/activity", () => Activity);
  jest.doMock("../utils/logger", () => ({ error: jest.fn() }));

  return { controller: require("../controllers/activityController"), Activity };
};

const VALID_JOB_ID = "507f1f77bcf86cd799439011";

describe("GET /api/activities/job/:jobId (getJobActivity)", () => {
  afterEach(() => jest.restoreAllMocks());

  test("returns the job's activity history, chronological (oldest first)", async () => {
    const { controller, Activity } = loadController();
    const chain = findChain([
      { action: "JOB_CREATED", createdAt: "2026-01-01" },
      { action: "JOB_STARTED", createdAt: "2026-01-02" },
    ]);
    Activity.find.mockReturnValueOnce(chain);

    const req = { params: { jobId: VALID_JOB_ID } };
    const res = makeResponse();

    await controller.getJobActivity(req, res);

    expect(Activity.find).toHaveBeenCalledWith({ relatedJobId: VALID_JOB_ID });
    expect(chain.sort).toHaveBeenCalledWith({ createdAt: 1 });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: [
          { action: "JOB_CREATED", createdAt: "2026-01-01" },
          { action: "JOB_STARTED", createdAt: "2026-01-02" },
        ],
      })
    );
  });

  test("400 for a malformed job id", async () => {
    const { controller, Activity } = loadController();

    const req = { params: { jobId: "not-an-id" } };
    const res = makeResponse();

    await controller.getJobActivity(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(Activity.find).not.toHaveBeenCalled();
  });

  test("returns an empty list (not an error) for a job with no activity yet", async () => {
    const { controller, Activity } = loadController();
    const chain = findChain([]);
    Activity.find.mockReturnValueOnce(chain);

    const req = { params: { jobId: VALID_JOB_ID } };
    const res = makeResponse();

    await controller.getJobActivity(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, data: [] }));
  });

  test("500 on an unexpected error", async () => {
    const { controller, Activity } = loadController();
    Activity.find.mockImplementationOnce(() => {
      throw new Error("db down");
    });

    const req = { params: { jobId: VALID_JOB_ID } };
    const res = makeResponse();

    await controller.getJobActivity(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});
