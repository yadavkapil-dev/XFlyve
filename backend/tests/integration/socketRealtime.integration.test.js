// Integration: real Socket.IO connections over a real (ephemeral-port) HTTP
// server, against the isolated in-memory MongoDB from Phase 7B (testDb.js —
// same mongodb-memory-server approach, no second isolation strategy).
//
// Phase 5's tests/socketAuth.test.js already thoroughly covers the AUTH and
// ROOM-ASSIGNMENT LOGIC as direct unit tests (calling authenticateSocket/
// handleConnection/emitToUser with fake socket objects or a real `io`
// instance with a spied `.to()`). That coverage is not repeated here. What
// was missing — and is net-new in this file — is proof that the real
// wiring works end to end: an actual socket.io-client connecting over a
// real network handshake, actually landing in the room Socket.IO itself
// tracks (not just a `.join()` call on a mock), an actually-connected
// second client never receiving another user's event, a live HTTP action
// triggering a real socket push to a connected client, and the REST
// fallback for a client that was never connected at all.
process.env.JWT_SECRET = "integration-test-secret";
process.env.RATE_LIMIT_MAX = "10000";
process.env.NODE_ENV = "test";

const http = require("http");
const { io: ioClient } = require("socket.io-client");
const request = require("supertest");
const { startTestDb, stopTestDb, clearTestDb } = require("./testDb");
const { createDriver, createTruck, tomorrow, authHeader, signToken } = require("./factories");
const { initSocket } = require("../../sockets/socketServer");
const { notifyUser } = require("../../services/notificationService");

let app;
let httpServer;
let io;
let baseUrl;
const openSockets = [];

const connectClient = (token, opts = {}) => {
  const socket = ioClient(baseUrl, {
    auth: token ? { token } : {},
    reconnection: false,
    forceNew: true,
    ...opts,
  });
  openSockets.push(socket);
  return socket;
};

const waitForEvent = (socket, event, timeoutMs = 3000) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for '${event}'`)), timeoutMs);
    socket.once(event, (payload) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });

// Waits `ms` and resolves with whatever (if anything) was received —used to
// assert a client did NOT receive an event within a reasonable window.
const waitAndCollect = (socket, event, ms = 500) =>
  new Promise((resolve) => {
    let received;
    socket.once(event, (payload) => {
      received = payload;
    });
    setTimeout(() => resolve(received), ms);
  });

beforeAll(async () => {
  await startTestDb();
  app = require("../../app");
  httpServer = http.createServer(app);
  io = initSocket(httpServer);
  await new Promise((resolve) => httpServer.listen(0, resolve));
  const { port } = httpServer.address();
  baseUrl = `http://localhost:${port}`;
}, 30000);

afterEach(async () => {
  while (openSockets.length) {
    const socket = openSockets.pop();
    socket.disconnect();
  }
  await clearTestDb();
});

afterAll(async () => {
  // io.close() tears down Socket.IO's own engine (ping/pong timers, room
  // state) and internally closes the underlying httpServer for us, in the
  // right order — closing httpServer directly would skip that first step.
  await new Promise((resolve) => io.close(resolve));
  await stopTestDb();
});

describe("Item: Authenticated connection", () => {
  test("PASS: a real client with a valid token establishes a real connection", async () => {
    const driver = await createDriver({ role: "driver" });
    const socket = connectClient(signToken(driver));

    await waitForEvent(socket, "connect");

    expect(socket.connected).toBe(true);
  });
});

describe("Item: Invalid token rejected", () => {
  test("PASS: a real client with an invalid token is rejected at the real handshake, never connects", async () => {
    const socket = connectClient("not-a-real-jwt");

    const err = await waitForEvent(socket, "connect_error");

    expect(err.message).toBe("Invalid or expired token");
    expect(socket.connected).toBe(false);
  });

  test("PASS: a real client with no token at all is rejected", async () => {
    const socket = connectClient(null);

    const err = await waitForEvent(socket, "connect_error");

    expect(err.message).toBe("Authentication required");
  });
});

describe("Item: Correct room assignment", () => {
  test("PASS: once connected, the server's real room registry shows the socket in exactly its own user room", async () => {
    const driver = await createDriver({ role: "driver" });
    const socket = connectClient(signToken(driver));
    await waitForEvent(socket, "connect");

    const ownRoomSockets = await io.in(`user:${driver._id}`).fetchSockets();
    expect(ownRoomSockets).toHaveLength(1);
    expect(ownRoomSockets[0].id).toBe(socket.id);

    const someoneElsesRoomSockets = await io.in("user:not-this-driver").fetchSockets();
    expect(someoneElsesRoomSockets).toHaveLength(0);
  });
});

describe("Item: Wrong-user isolation", () => {
  test("PASS: a notification targeted at driver A reaches only driver A's real connected socket, never driver B's", async () => {
    const driverA = await createDriver({ role: "driver" });
    const driverB = await createDriver({ role: "driver" });
    const socketA = connectClient(signToken(driverA));
    const socketB = connectClient(signToken(driverB));
    await Promise.all([waitForEvent(socketA, "connect"), waitForEvent(socketB, "connect")]);

    const receivedByA = waitForEvent(socketA, "notification:new");
    const receivedByBAttempt = waitAndCollect(socketB, "notification:new");

    await notifyUser({
      recipient: driverA._id,
      type: "job_updated",
      title: "For A only",
      message: "isolation check",
      resourceType: "job",
      resourceId: driverA._id,
    });

    const payloadForA = await receivedByA;
    expect(payloadForA.title).toBe("For A only");

    const payloadForB = await receivedByBAttempt;
    expect(payloadForB).toBeUndefined();
  });
});

describe("Item: Notification event delivery", () => {
  test("PASS: a real HTTP action (admin assigns a job) pushes a live notification to the driver's connected socket", async () => {
    const admin = await createDriver({ role: "admin" });
    const driver = await createDriver({ role: "driver" });
    const truck = await createTruck();
    const socket = connectClient(signToken(driver));
    await waitForEvent(socket, "connect");

    const received = waitForEvent(socket, "notification:new");

    const createRes = await request(app)
      .post("/api/jobs/create")
      .set("Authorization", authHeader(admin))
      .send({
        title: "Live push run",
        description: "desc",
        pickupLocation: "A",
        deliveryLocation: "B",
        assignedTo: driver._id.toString(),
        assignedTruck: truck._id.toString(),
        jobDate: tomorrow(),
        startTime: "08:00",
        jobType: "local",
      });
    expect(createRes.status).toBe(201);

    const payload = await received;
    expect(payload.type).toBe("job_assigned");
    expect(String(payload.recipient)).toBe(String(driver._id));
  });
});

describe("Item: REST fallback (offline delivery)", () => {
  test("PASS: a notification created while the recipient has no active socket is still retrievable via GET /api/notifications", async () => {
    const admin = await createDriver({ role: "admin" });
    const driver = await createDriver({ role: "driver" });
    const truck = await createTruck();

    // Deliberately never connect a socket for this driver — they're "offline".
    const createRes = await request(app)
      .post("/api/jobs/create")
      .set("Authorization", authHeader(admin))
      .send({
        title: "Offline delivery run",
        description: "desc",
        pickupLocation: "A",
        deliveryLocation: "B",
        assignedTo: driver._id.toString(),
        assignedTruck: truck._id.toString(),
        jobDate: tomorrow(),
        startTime: "08:00",
        jobType: "local",
      });
    expect(createRes.status).toBe(201);

    // "Later" (or "once they reconnect") — a plain REST call, no socket at all.
    const listRes = await request(app).get("/api/notifications").set("Authorization", authHeader(driver));

    expect(listRes.status).toBe(200);
    const notification = listRes.body.data.find((n) => n.type === "job_assigned");
    expect(notification).toBeTruthy();
    expect(notification.read).toBe(false);
  });
});
