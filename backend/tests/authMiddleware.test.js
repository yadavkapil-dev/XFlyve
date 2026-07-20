const jwt = require("jsonwebtoken");

const JWT_SECRET = "test-secret-for-auth-middleware-spec";

const loadMiddleware = () => {
  jest.resetModules();
  process.env.JWT_SECRET = JWT_SECRET;

  const Driver = { findById: jest.fn() };
  jest.doMock("../models/driver", () => Driver);

  return {
    authMiddleware: require("../middlewares/authMiddleware"),
    Driver,
  };
};

const makeReqRes = (token) => {
  const req = { headers: token ? { authorization: `Bearer ${token}` } : {} };
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
  const next = jest.fn();
  return { req, res, next };
};

const selectMock = (value) => ({ select: jest.fn().mockResolvedValue(value) });

describe("authMiddleware", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("rejects with 401 when no Authorization header is present", async () => {
    const { authMiddleware } = loadMiddleware();
    const { req, res, next } = makeReqRes(null);

    await authMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  test("rejects with 401 for a malformed/invalid token", async () => {
    const { authMiddleware } = loadMiddleware();
    const { req, res, next } = makeReqRes("not-a-real-token");

    await authMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Invalid or expired token" })
    );
    expect(next).not.toHaveBeenCalled();
  });

  test("attaches req.user and calls next() for a valid token belonging to an active account", async () => {
    const { authMiddleware, Driver } = loadMiddleware();
    const token = jwt.sign({ id: "driver-1", role: "driver" }, JWT_SECRET);
    Driver.findById.mockReturnValueOnce(selectMock({ recordStatus: "active", active: true }));
    const { req, res, next } = makeReqRes(token);

    await authMiddleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.user).toMatchObject({ id: "driver-1", _id: "driver-1", role: "driver" });
    expect(res.status).not.toHaveBeenCalled();
  });

  test("rejects with 401 when the account was archived after the token was issued", async () => {
    const { authMiddleware, Driver } = loadMiddleware();
    const token = jwt.sign({ id: "driver-1", role: "driver" }, JWT_SECRET);
    Driver.findById.mockReturnValueOnce(selectMock({ recordStatus: "archived", active: false }));
    const { req, res, next } = makeReqRes(token);

    await authMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Account is inactive or no longer available" })
    );
    expect(next).not.toHaveBeenCalled();
  });

  test("rejects with 401 when the account was deactivated (recordStatus inactive) after the token was issued", async () => {
    const { authMiddleware, Driver } = loadMiddleware();
    const token = jwt.sign({ id: "driver-1", role: "driver" }, JWT_SECRET);
    Driver.findById.mockReturnValueOnce(selectMock({ recordStatus: "inactive", active: true }));
    const { req, res, next } = makeReqRes(token);

    await authMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  test("rejects with 401 when active is explicitly false even though recordStatus is active", async () => {
    const { authMiddleware, Driver } = loadMiddleware();
    const token = jwt.sign({ id: "driver-1", role: "driver" }, JWT_SECRET);
    Driver.findById.mockReturnValueOnce(selectMock({ recordStatus: "active", active: false }));
    const { req, res, next } = makeReqRes(token);

    await authMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  test("rejects with 401 when the account no longer exists", async () => {
    const { authMiddleware, Driver } = loadMiddleware();
    const token = jwt.sign({ id: "deleted-driver" }, JWT_SECRET);
    Driver.findById.mockReturnValueOnce(selectMock(null));
    const { req, res, next } = makeReqRes(token);

    await authMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });
});
