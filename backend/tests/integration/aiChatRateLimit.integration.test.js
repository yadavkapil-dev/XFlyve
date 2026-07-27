// Integration: the per-user rate limiter on POST /api/ai/chat
// (config/rateLimiters.js's aiChatLimiter). A separate file from
// aiChat.integration.test.js specifically so it can override
// AI_CHAT_RATE_LIMIT_MAX to a small number before app.js (and therefore
// config/rateLimiters.js) is first required — that env var is only read
// once, at rateLimit() construction time, so it has to be set before the
// very first require of ../../app in this process.
process.env.JWT_SECRET = "integration-test-secret";
process.env.RATE_LIMIT_MAX = "10000"; // the general per-IP limiter — not what's under test here
process.env.AI_CHAT_RATE_LIMIT_MAX = "3";
process.env.NODE_ENV = "test";

jest.doMock("../../services/ai/providers/OpenRouterProvider", () => {
  return class FakeOpenRouterProvider {
    async chat() {
      return { role: "assistant", content: "ok" };
    }
  };
});

const request = require("supertest");
const { startTestDb, stopTestDb, clearTestDb } = require("./testDb");
const { createDriver, authHeader } = require("./factories");

let app;

beforeAll(async () => {
  await startTestDb();
  app = require("../../app");
}, 30000);

afterEach(async () => {
  await clearTestDb();
});

afterAll(async () => {
  await stopTestDb();
});

const chat = (driver) => request(app).post("/api/ai/chat").set("Authorization", authHeader(driver)).send({ message: "hi" });

describe("POST /api/ai/chat: per-user rate limiting (AI_CHAT_RATE_LIMIT_MAX=3 for this test)", () => {
  test("allows requests up to the limit, then rejects the next one with 429", async () => {
    const driver = await createDriver();

    const first = await chat(driver);
    const second = await chat(driver);
    const third = await chat(driver);
    const fourth = await chat(driver);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(third.status).toBe(200);

    expect(fourth.status).toBe(429);
    expect(fourth.body).toEqual({
      success: false,
      message: "Too many assistant requests, please try again later.",
      retryAfter: 60 * 60,
    });
  });

  test("is scoped per-user, not per-IP — a second user (same test client/IP) is unaffected by the first user's usage", async () => {
    const driverA = await createDriver();
    const driverB = await createDriver();

    // Exhaust driver A's limit.
    await chat(driverA);
    await chat(driverA);
    await chat(driverA);
    const driverAFourth = await chat(driverA);
    expect(driverAFourth.status).toBe(429);

    // Driver B, making requests from the exact same supertest client (so
    // the exact same source IP), is completely unaffected.
    const driverBFirst = await chat(driverB);
    expect(driverBFirst.status).toBe(200);
  });
});
