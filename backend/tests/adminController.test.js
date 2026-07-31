const makeResponse = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

const loadController = () => {
  jest.resetModules();

  const Driver = { findById: jest.fn(), findOne: jest.fn() };
  jest.doMock("../models/driver", () => Driver);
  jest.doMock("../models/job", () => ({}));
  jest.doMock("../models/truck", () => ({}));
  jest.doMock("../models/dailyWorkLog", () => ({}));
  jest.doMock("../models/jobPod", () => ({}));
  jest.doMock("../utils/logger", () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn() }));

  return { controller: require("../controllers/adminController"), Driver };
};

describe("adminController.updateDriver", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("persists all three profile fields (phone, hourlyRate, kmRate)", async () => {
    const { controller, Driver } = loadController();
    const driverDoc = {
      _id: "driver-1",
      name: "Old Name",
      email: "old@example.com",
      save: jest.fn().mockResolvedValue(undefined),
      toObject: function toObject() {
        return { ...this };
      },
    };
    Driver.findById.mockResolvedValueOnce(driverDoc);
    Driver.findOne.mockReturnValueOnce({ lean: jest.fn().mockResolvedValue(null) });

    const req = {
      params: { driverId: "driver-1" },
      body: {
        name: "New Name",
        email: "new@example.com",
        phone: "0400000000",
        hourlyRate: 35,
        kmRate: 1.2,
      },
    };
    const res = makeResponse();

    await controller.updateDriver(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(driverDoc.save).toHaveBeenCalledTimes(1);
    expect(driverDoc.phone).toBe("0400000000");
    expect(driverDoc.hourlyRate).toBe(35);
    expect(driverDoc.kmRate).toBe(1.2);
  });

  test("leaves profile fields untouched when the request omits them", async () => {
    const { controller, Driver } = loadController();
    const driverDoc = {
      _id: "driver-1",
      name: "Old Name",
      email: "old@example.com",
      phone: "0411111111",
      save: jest.fn().mockResolvedValue(undefined),
      toObject: function toObject() {
        return { ...this };
      },
    };
    Driver.findById.mockResolvedValueOnce(driverDoc);
    Driver.findOne.mockReturnValueOnce({ lean: jest.fn().mockResolvedValue(null) });

    const req = {
      params: { driverId: "driver-1" },
      body: { name: "New Name", email: "new@example.com" },
    };
    const res = makeResponse();

    await controller.updateDriver(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(driverDoc.phone).toBe("0411111111");
  });
});
