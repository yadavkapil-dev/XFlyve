const makeResponse = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

const loadController = () => {
  jest.resetModules();

  const Driver = { findOne: jest.fn() };
  const bcrypt = { compare: jest.fn() };
  const jwt = { sign: jest.fn().mockReturnValue("fake.jwt.token") };

  jest.doMock("../models/driver", () => Driver);
  jest.doMock("bcryptjs", () => bcrypt);
  jest.doMock("jsonwebtoken", () => jwt);
  jest.doMock("../utils/logger", () => ({ error: jest.fn() }));

  return {
    controller: require("../controllers/authController"),
    Driver,
    bcrypt,
    jwt,
  };
};

const makeUser = (overrides = {}) => ({
  _id: "driver-id-123",
  name: "Test Driver",
  email: "driver@example.com",
  password: "hashed-password",
  role: "driver",
  recordStatus: "active",
  active: true,
  ...overrides,
});

describe("authController.login", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("logs in an active driver with correct credentials", async () => {
    const { controller, Driver, bcrypt } = loadController();
    Driver.findOne.mockResolvedValueOnce(makeUser());
    bcrypt.compare.mockResolvedValueOnce(true);

    const req = { body: { email: "driver@example.com", password: "correct-password" } };
    const res = makeResponse();

    await controller.login(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ status: "success", token: "fake.jwt.token" })
    );
  });

  test("rejects an archived account even with correct credentials", async () => {
    const { controller, Driver, bcrypt } = loadController();
    Driver.findOne.mockResolvedValueOnce(makeUser({ recordStatus: "archived" }));
    bcrypt.compare.mockResolvedValueOnce(true);

    const req = { body: { email: "driver@example.com", password: "correct-password" } };
    const res = makeResponse();

    await controller.login(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      status: "fail",
      message: "Your account is inactive. Please contact your administrator.",
    });
  });

  test("rejects an inactive account (active: false) even with correct credentials", async () => {
    const { controller, Driver, bcrypt } = loadController();
    Driver.findOne.mockResolvedValueOnce(makeUser({ recordStatus: "active", active: false }));
    bcrypt.compare.mockResolvedValueOnce(true);

    const req = { body: { email: "driver@example.com", password: "correct-password" } };
    const res = makeResponse();

    await controller.login(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      status: "fail",
      message: "Your account is inactive. Please contact your administrator.",
    });
  });

  test("an inactive account with a wrong password gets 'invalid credentials', not an inactive-account hint", async () => {
    const { controller, Driver, bcrypt } = loadController();
    Driver.findOne.mockResolvedValueOnce(makeUser({ recordStatus: "archived" }));
    bcrypt.compare.mockResolvedValueOnce(false);

    const req = { body: { email: "driver@example.com", password: "wrong-password" } };
    const res = makeResponse();

    await controller.login(req, res);

    // Password is checked before account status, so a wrong password never
    // reveals whether the account itself is active/archived.
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ status: "fail", message: "Invalid credentials" });
  });

  test("rejects with invalid credentials when the account does not exist", async () => {
    const { controller, Driver } = loadController();
    Driver.findOne.mockResolvedValueOnce(null);

    const req = { body: { email: "nobody@example.com", password: "whatever" } };
    const res = makeResponse();

    await controller.login(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ status: "fail", message: "Invalid credentials" });
  });
});
