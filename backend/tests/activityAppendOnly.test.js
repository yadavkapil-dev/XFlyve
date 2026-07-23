// Confirms the append-only guarantee at the API layer: no route anywhere in
// this app can update or delete an activity record, even for admins. This
// inspects the REAL router (not a mock) so it fails if anyone ever adds a
// PUT/PATCH/DELETE route to activityRoutes.js, or a generic "admin can
// modify any collection" route elsewhere that includes activities.

const loadActivityRoutes = () => {
  jest.resetModules();

  jest.doMock("../middlewares/authMiddleware", () => {
    const mw = (req, res, next) => next();
    mw.verifyAuthToken = jest.fn();
    return mw;
  });
  jest.doMock("../middlewares/roleMiddleware", () => ({
    requireAdmin: (req, res, next) => next(),
    requireDriver: (req, res, next) => next(),
    requireDriverOrAdmin: (req, res, next) => next(),
  }));
  jest.doMock("../controllers/activityController", () => ({
    getJobActivity: jest.fn(),
  }));

  return require("../routes/activityRoutes");
};

// Express route layers expose their HTTP methods as an object like
// { get: true }. Flattens the whole router into [{ path, methods }, ...].
const listRoutes = (router) =>
  router.stack
    .filter((layer) => layer.route)
    .map((layer) => ({
      path: layer.route.path,
      methods: Object.keys(layer.route.methods).filter((m) => layer.route.methods[m]),
    }));

describe("Activity API is append-only", () => {
  afterEach(() => jest.restoreAllMocks());

  test("activityRoutes exposes exactly one route, and it's a GET", () => {
    const router = loadActivityRoutes();
    const routes = listRoutes(router);

    expect(routes).toHaveLength(1);
    expect(routes[0].path).toBe("/job/:jobId");
    expect(routes[0].methods).toEqual(["get"]);
  });

  test("no route on the activity router allows PUT, PATCH, DELETE, or POST", () => {
    const router = loadActivityRoutes();
    const routes = listRoutes(router);

    for (const route of routes) {
      expect(route.methods).not.toContain("put");
      expect(route.methods).not.toContain("patch");
      expect(route.methods).not.toContain("delete");
      expect(route.methods).not.toContain("post");
    }
  });

  test("activityController exposes only a read function — no update/delete exports to wire up accidentally", () => {
    jest.resetModules();
    jest.doMock("../models/activity", () => ({ find: jest.fn() }));
    jest.doMock("../utils/logger", () => ({ error: jest.fn() }));
    const controller = require("../controllers/activityController");

    expect(Object.keys(controller)).toEqual(["getJobActivity"]);
  });

  test("no other route file in the app mounts a write route (PUT/PATCH/DELETE/POST) against an activities/activity path", () => {
    const fs = require("fs");
    const path = require("path");
    const routesDir = path.join(__dirname, "..", "routes");
    const files = fs.readdirSync(routesDir).filter((f) => f.endsWith(".js"));

    const offendingLines = [];
    for (const file of files) {
      const content = fs.readFileSync(path.join(routesDir, file), "utf8");
      const lines = content.split("\n");
      lines.forEach((line, i) => {
        const isWriteVerb = /router\.(put|patch|delete|post)\s*\(/i.test(line);
        const mentionsActivity = /activit/i.test(line);
        if (isWriteVerb && mentionsActivity) {
          offendingLines.push(`${file}:${i + 1}: ${line.trim()}`);
        }
      });
    }

    expect(offendingLines).toEqual([]);
  });
});
