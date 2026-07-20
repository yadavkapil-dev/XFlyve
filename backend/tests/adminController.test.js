const express = require("express");
const request = require("supertest");

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

  test("persists all seven profile fields (driverType, phone, payType, hourlyRate, kmRate, deliveryRate, abn)", async () => {
    const { controller, Driver } = loadController();
    const driverDoc = {
      _id: "driver-1",
      name: "Old Name",
      email: "old@example.com",
      driverType: undefined,
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
        driverType: "interstate",
        phone: "0400000000",
        payType: "per_km",
        hourlyRate: 35,
        kmRate: 1.2,
        deliveryRate: 15,
        abn: "12345678901",
      },
    };
    const res = makeResponse();

    await controller.updateDriver(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(driverDoc.save).toHaveBeenCalledTimes(1);
    expect(driverDoc.driverType).toBe("interstate");
    expect(driverDoc.phone).toBe("0400000000");
    expect(driverDoc.payType).toBe("per_km");
    expect(driverDoc.hourlyRate).toBe(35);
    expect(driverDoc.kmRate).toBe(1.2);
    expect(driverDoc.deliveryRate).toBe(15);
    expect(driverDoc.abn).toBe("12345678901");
  });

  test("leaves profile fields untouched when the request omits them", async () => {
    const { controller, Driver } = loadController();
    const driverDoc = {
      _id: "driver-1",
      name: "Old Name",
      email: "old@example.com",
      driverType: "local",
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
    expect(driverDoc.driverType).toBe("local");
    expect(driverDoc.phone).toBe("0411111111");
  });
});

describe("PUT /api/admin/drivers/:driverId — driverType validation", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  const buildApp = () => {
    jest.resetModules();

    const Driver = { findById: jest.fn(), findOne: jest.fn() };
    jest.doMock("../models/driver", () => Driver);
    jest.doMock("../models/job", () => ({}));
    jest.doMock("../models/truck", () => ({}));
    jest.doMock("../models/dailyWorkLog", () => ({}));
    jest.doMock("../models/jobPod", () => ({}));
    jest.doMock("../utils/logger", () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn() }));

    const { driverUpdateValidator } = require("../validators/authValidator");
    const validateRequest = require("../middlewares/validateRequest");
    const controller = require("../controllers/adminController");

    const app = express();
    app.use(express.json());
    // Mounted at the exact path validateRequest special-cases for 400 vs 422.
    app.put("/api/admin/drivers/:driverId", driverUpdateValidator, validateRequest, controller.updateDriver);

    return { app, Driver };
  };

  test("rejects an invalid driverType value with 400 and never reaches the controller", async () => {
    const { app, Driver } = buildApp();

    const res = await request(app)
      .put("/api/admin/drivers/507f1f77bcf86cd799439011")
      .send({ name: "Test Driver", email: "test@example.com", driverType: "not-a-real-type" });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("driverType must be 'local' or 'interstate'");
    expect(Driver.findById).not.toHaveBeenCalled();
  });

  test("accepts a valid driverType value and reaches the controller", async () => {
    const { app, Driver } = buildApp();
    const driverDoc = {
      _id: "507f1f77bcf86cd799439011",
      save: jest.fn().mockResolvedValue(undefined),
      toObject: function toObject() {
        return { ...this };
      },
    };
    Driver.findById.mockResolvedValueOnce(driverDoc);
    Driver.findOne.mockReturnValueOnce({ lean: jest.fn().mockResolvedValue(null) });

    const res = await request(app)
      .put("/api/admin/drivers/507f1f77bcf86cd799439011")
      .send({ name: "Test Driver", email: "test@example.com", driverType: "interstate" });

    expect(res.status).toBe(200);
    expect(driverDoc.driverType).toBe("interstate");
  });
});
