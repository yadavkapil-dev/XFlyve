const jwt = require("jsonwebtoken");

const JWT_SECRET = "test-secret-for-socket-auth-spec";

const loadSocketServer = () => {
  jest.resetModules();
  process.env.JWT_SECRET = JWT_SECRET;

  const Driver = { findById: jest.fn() };
  jest.doMock("../models/driver", () => Driver);
  jest.doMock("../utils/logger", () => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn() }));

  return { socketServer: require("../sockets/socketServer"), Driver };
};

const selectMock = (value) => ({ select: jest.fn().mockResolvedValue(value) });

// Minimal fake socket — enough surface for authenticateSocket/handleConnection.
const makeFakeSocket = (token) => ({
  handshake: { auth: token ? { token } : {} },
  join: jest.fn(),
  user: undefined,
});

describe("Socket.IO handshake authentication (authenticateSocket)", () => {
  afterEach(() => jest.restoreAllMocks());

  test("rejects a connection with no token", async () => {
    const { socketServer } = loadSocketServer();
    const socket = makeFakeSocket(null);
    const next = jest.fn();

    await socketServer.authenticateSocket(socket, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
    expect(next.mock.calls[0][0].message).toBe("Authentication required");
    expect(socket.user).toBeUndefined();
  });

  test("rejects a connection with an invalid/malformed token", async () => {
    const { socketServer } = loadSocketServer();
    const socket = makeFakeSocket("not-a-real-token");
    const next = jest.fn();

    await socketServer.authenticateSocket(socket, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
    expect(next.mock.calls[0][0].message).toBe("Invalid or expired token");
    expect(socket.user).toBeUndefined();
  });

  test("rejects a connection for a deactivated/archived account", async () => {
    const { socketServer, Driver } = loadSocketServer();
    const token = jwt.sign({ id: "driver-1", role: "driver" }, JWT_SECRET);
    Driver.findById.mockReturnValueOnce(selectMock({ recordStatus: "archived", active: true }));
    const socket = makeFakeSocket(token);
    const next = jest.fn();

    await socketServer.authenticateSocket(socket, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
    expect(next.mock.calls[0][0].message).toBe("Account is inactive or no longer available");
    expect(socket.user).toBeUndefined();
  });

  test("accepts a connection with a valid token for an active account and attaches socket.user", async () => {
    const { socketServer, Driver } = loadSocketServer();
    const token = jwt.sign({ id: "driver-1", role: "driver" }, JWT_SECRET);
    Driver.findById.mockReturnValueOnce(selectMock({ recordStatus: "active", active: true }));
    const socket = makeFakeSocket(token);
    const next = jest.fn();

    await socketServer.authenticateSocket(socket, next);

    expect(next).toHaveBeenCalledWith(); // called with no error
    expect(socket.user).toMatchObject({ id: "driver-1", _id: "driver-1", role: "driver" });
  });
});

describe("Socket.IO room isolation (handleConnection)", () => {
  afterEach(() => jest.restoreAllMocks());

  test("a socket only ever joins its own user's room", () => {
    const { socketServer } = loadSocketServer();
    const socket = { user: { id: "driver-1", _id: "driver-1", role: "driver" }, join: jest.fn() };

    socketServer.handleConnection(socket);

    expect(socket.join).toHaveBeenCalledTimes(1);
    expect(socket.join).toHaveBeenCalledWith("user:driver-1");
  });

  test("two different authenticated sockets are placed into two different, non-overlapping rooms", () => {
    const { socketServer } = loadSocketServer();
    const socketA = { user: { id: "user-a", _id: "user-a", role: "driver" }, join: jest.fn() };
    const socketB = { user: { id: "user-b", _id: "user-b", role: "admin" }, join: jest.fn() };

    socketServer.handleConnection(socketA);
    socketServer.handleConnection(socketB);

    expect(socketA.join).toHaveBeenCalledWith("user:user-a");
    expect(socketB.join).toHaveBeenCalledWith("user:user-b");
    expect(socketA.join).not.toHaveBeenCalledWith("user:user-b");
    expect(socketB.join).not.toHaveBeenCalledWith("user:user-a");
  });

  test("there is no client-controlled input to handleConnection that could target another user's room — the room is derived only from the server-verified socket.user set by authenticateSocket", () => {
    const { socketServer } = loadSocketServer();
    // Simulate a socket whose handshake carried attacker-supplied data —
    // handleConnection never reads socket.handshake, only socket.user (which
    // authenticateSocket alone is allowed to set from a verified JWT).
    const socket = {
      user: { id: "real-user", _id: "real-user", role: "driver" },
      handshake: { auth: { token: "irrelevant" }, query: { room: "user:someone-else" }, joinRoom: "user:someone-else" },
      join: jest.fn(),
    };

    socketServer.handleConnection(socket);

    expect(socket.join).toHaveBeenCalledTimes(1);
    expect(socket.join).toHaveBeenCalledWith("user:real-user");
  });
});

describe("emitToUser targets only the intended user's room", () => {
  afterEach(() => jest.restoreAllMocks());

  test("no-ops (does not throw) when no socket server has been initialized", () => {
    const { socketServer } = loadSocketServer();
    expect(() => socketServer.emitToUser("driver-1", "notification:new", { a: 1 })).not.toThrow();
  });

  test("emits only to the target user's room, once initialized on a real (unbound) http server", () => {
    const http = require("http");
    const { socketServer } = loadSocketServer();

    // A real Socket.IO Server can be constructed against a plain http.Server
    // without it ever being bound to a port — .to(room).emit(...) just
    // targets the in-memory room adapter, no live connection required.
    const httpServer = http.createServer();
    const io = socketServer.initSocket(httpServer);

    const emit = jest.fn();
    const toSpy = jest.spyOn(io, "to").mockReturnValue({ emit });

    socketServer.emitToUser("driver-1", "notification:new", { hello: "world" });

    expect(toSpy).toHaveBeenCalledTimes(1);
    expect(toSpy).toHaveBeenCalledWith("user:driver-1");
    expect(toSpy).not.toHaveBeenCalledWith("user:someone-else");
    expect(emit).toHaveBeenCalledWith("notification:new", { hello: "world" });

    io.close();
  });
});
