// truckController.addTruck had zero test coverage anywhere in the suite
// before this file — updateTruck/deleteTruck are covered via
// jobWorkflow.test.js's "Truck admin status workflow", but the create path
// (and specifically, that it works with just truckNumber now that capacity
// has been removed from the schema/validator) was never exercised.
const makeResponse = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

const loadController = () => {
  jest.resetModules();

  const Truck = jest.fn().mockImplementation((data) => ({
    ...data,
    _id: "truck-1",
    save: jest.fn().mockResolvedValue(undefined),
  }));
  Truck.findOne = jest.fn();
  Truck.find = jest.fn();
  Truck.countDocuments = jest.fn();
  const Job = { exists: jest.fn() };
  const TruckAssignment = { exists: jest.fn() };

  jest.doMock("../models/truck", () => Truck);
  jest.doMock("../models/job", () => Job);
  jest.doMock("../models/dailyTruckAssignment", () => TruckAssignment);
  jest.doMock("../utils/logger", () => ({ error: jest.fn() }));

  return { controller: require("../controllers/truckController"), Truck, Job, TruckAssignment };
};

describe("truckController.addTruck", () => {
  afterEach(() => jest.restoreAllMocks());

  test("creates a truck with just truckNumber — capacity is no longer required or accepted", async () => {
    const { controller, Truck } = loadController();
    Truck.findOne.mockResolvedValueOnce(null);

    const req = { body: { truckNumber: "trk-9" } };
    const res = makeResponse();

    await controller.addTruck(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(Truck).toHaveBeenCalledWith(
      expect.objectContaining({ truckNumber: "TRK-9", status: "available" })
    );
    const createdArg = Truck.mock.calls[0][0];
    expect(createdArg).not.toHaveProperty("capacity");
  });

  test("normalizes truckNumber to trimmed uppercase", async () => {
    const { controller, Truck } = loadController();
    Truck.findOne.mockResolvedValueOnce(null);

    const req = { body: { truckNumber: "  trk-10  " } };
    const res = makeResponse();

    await controller.addTruck(req, res);

    expect(Truck).toHaveBeenCalledWith(expect.objectContaining({ truckNumber: "TRK-10" }));
  });

  test("an explicit status of out-of-service is honored on create; anything else defaults to available", async () => {
    const { controller, Truck } = loadController();
    Truck.findOne.mockResolvedValueOnce(null);

    const req = { body: { truckNumber: "TRK-11", status: "out-of-service" } };
    const res = makeResponse();

    await controller.addTruck(req, res);

    expect(Truck).toHaveBeenCalledWith(expect.objectContaining({ status: "out-of-service" }));
  });

  test("rejects a duplicate, non-archived truckNumber with 409, never constructs a new Truck", async () => {
    const { controller, Truck } = loadController();
    Truck.findOne.mockResolvedValueOnce({ truckNumber: "TRK-9", recordStatus: "active" });

    const req = { body: { truckNumber: "TRK-9" } };
    const res = makeResponse();

    await controller.addTruck(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(Truck).not.toHaveBeenCalled();
  });

  test("reactivates a previously-archived truck with the same number instead of creating a new one", async () => {
    const { controller, Truck } = loadController();
    const archivedTruck = {
      truckNumber: "TRK-9",
      recordStatus: "archived",
      status: "out-of-service",
      save: jest.fn().mockResolvedValue(undefined),
    };
    Truck.findOne.mockResolvedValueOnce(archivedTruck);

    const req = { body: { truckNumber: "TRK-9" } };
    const res = makeResponse();

    await controller.addTruck(req, res);

    expect(Truck).not.toHaveBeenCalled();
    expect(archivedTruck.recordStatus).toBe("active");
    expect(archivedTruck.status).toBe("available");
    expect(archivedTruck.save).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(201);
  });

  test("a duplicate-key error from the database (race condition) still surfaces as a clean 409", async () => {
    const { controller, Truck } = loadController();
    Truck.findOne.mockResolvedValueOnce(null);
    Truck.mockImplementationOnce(() => ({
      save: jest.fn().mockRejectedValue(Object.assign(new Error("dup"), { code: 11000 })),
    }));

    const req = { body: { truckNumber: "TRK-9" } };
    const res = makeResponse();

    await controller.addTruck(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
  });
});
