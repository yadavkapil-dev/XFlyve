const { serverErrorStatus } = require("../helpers");

module.exports = {
  "/": {
    get: {
      tags: ["Health"],
      summary: "API root ping",
      description: "Basic reachability check. No auth required.",
      responses: {
        200: {
          description: "OK",
          content: { "application/json": { example: { success: true, message: "Xflyve backend API is running 🚀" } } },
        },
      },
    },
  },
  "/test": {
    get: {
      tags: ["Health"],
      summary: "Legacy plain-text smoke check (internal — not a real API feature)",
      description: 'Returns a plain-text body, not JSON. Flagged during the Phase 10 audit as a debug leftover rather than a real endpoint — kept documented here for completeness since it is publicly reachable with no auth, but there is no reason for a client to depend on it over `/healthz`.',
      responses: {
        200: {
          description: "OK (plain text, not JSON)",
          content: { "text/html": { example: "Xflyve Backend Working" } },
        },
      },
    },
  },
  "/healthz": {
    get: {
      tags: ["Health"],
      summary: "Production health check",
      description: "Reports app availability and MongoDB connectivity only — no secrets or internal detail. Used by the CI/CD pipeline's post-deploy smoke test.",
      responses: {
        200: {
          description: "Healthy — database connected.",
          content: { "application/json": { example: { status: "ok", uptime: 1234.56, database: "connected" } } },
        },
        503: {
          description: "Degraded — database not connected.",
          content: { "application/json": { example: { status: "degraded", uptime: 1234.56, database: "disconnected" } } },
        },
      },
    },
  },
};
