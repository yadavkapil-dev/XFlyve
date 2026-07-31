const makeResponse = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

// listWorkDiariesByDriver: find().populate().populate().sort().skip().limit().lean()
const leanFindChain = (result) => {
  const chain = {
    populate: jest.fn(() => chain),
    sort: jest.fn(() => chain),
    skip: jest.fn(() => chain),
    limit: jest.fn(() => chain),
    lean: jest.fn().mockResolvedValue(result),
  };
  return chain;
};

const loadController = () => {
  jest.resetModules();

  const WorkDiary = { find: jest.fn(), countDocuments: jest.fn() };
  jest.doMock("../models/workDiary", () => WorkDiary);
  jest.doMock("../models/job", () => ({}));
  jest.doMock("../utils/logger", () => ({ error: jest.fn() }));

  return { controller: require("../controllers/workDiaryController"), WorkDiary };
};

const VALID_DRIVER_ID = "507f1f77bcf86cd799439011";

describe("GET /api/workdiaries/driver/:driverId (listWorkDiariesByDriver) — pagination/filter, URL-scoped", () => {
  afterEach(() => jest.restoreAllMocks());

  test("page 1 defaults, scoped to the URL driverId", async () => {
    const { controller, WorkDiary } = loadController();
    const chain = leanFindChain([{ _id: "wd1" }]);
    WorkDiary.find.mockReturnValueOnce(chain);
    WorkDiary.countDocuments.mockResolvedValueOnce(1);

    const req = {
      params: { driverId: VALID_DRIVER_ID },
      query: {},
      user: { id: VALID_DRIVER_ID, role: "driver" },
    };
    const res = makeResponse();
    await controller.listWorkDiariesByDriver(req, res);

    expect(WorkDiary.find).toHaveBeenCalledWith(expect.objectContaining({ driverId: VALID_DRIVER_ID }));
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ pagination: { page: 1, limit: 20, total: 1, totalPages: 1 } })
    );
  });

  test("page 2 skip with includeOlder combined", async () => {
    const { controller, WorkDiary } = loadController();
    const chain = leanFindChain([]);
    WorkDiary.find.mockReturnValueOnce(chain);
    WorkDiary.countDocuments.mockResolvedValueOnce(0);

    const req = {
      params: { driverId: VALID_DRIVER_ID },
      query: { page: "2", limit: "5", includeOlder: "true" },
      user: { id: VALID_DRIVER_ID, role: "driver" },
    };
    const res = makeResponse();
    await controller.listWorkDiariesByDriver(req, res);

    expect(chain.skip).toHaveBeenCalledWith(5);
    const calledQuery = WorkDiary.find.mock.calls[0][0];
    expect(calledQuery.driverId).toBe(VALID_DRIVER_ID);
    // includeOlder:"true" means no 30-day-cutoff $or should be applied.
    expect(calledQuery.$or).toBeUndefined();
  });

  test("sort override to workDate", async () => {
    const { controller, WorkDiary } = loadController();
    const chain = leanFindChain([]);
    WorkDiary.find.mockReturnValueOnce(chain);
    WorkDiary.countDocuments.mockResolvedValueOnce(0);

    const req = {
      params: { driverId: VALID_DRIVER_ID },
      query: { sort: "workDate" },
      user: { id: VALID_DRIVER_ID, role: "driver" },
    };
    const res = makeResponse();
    await controller.listWorkDiariesByDriver(req, res);

    expect(chain.sort).toHaveBeenCalledWith({ workDate: 1 });
  });
});
