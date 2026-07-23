const path = require("path");
const { defineConfig } = require("@playwright/test");

// Arbitrary, unlikely-to-collide ports so this never fights a real dev
// server the user might already have running on the usual 3001/5173.
const BACKEND_PORT = 4310;
const FRONTEND_PORT = 4311;
const FRONTEND_URL = `http://localhost:${FRONTEND_PORT}`;

module.exports = defineConfig({
  testDir: "./tests",
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  // Deliberately 0: Phase 7E asks for an honest flakiness report across
  // repeated full runs, not a retry-laundered green result.
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: FRONTEND_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: [
    {
      // Boots the real backend against its own fresh mongodb-memory-server
      // instance (see backend/tests/e2e/start-e2e-backend.js) — never the
      // developer's real MONGO_URI from backend/.env.
      command: "node start-e2e-backend.js",
      cwd: path.join(__dirname, "../backend/tests/e2e"),
      port: BACKEND_PORT,
      timeout: 60_000,
      reuseExistingServer: false,
      env: {
        PORT: String(BACKEND_PORT),
        JWT_SECRET: "e2e-playwright-secret",
        NODE_ENV: "test",
        RATE_LIMIT_MAX: "100000",
        CORS_WHITELIST: FRONTEND_URL,
      },
    },
    {
      command: `npx vite --port ${FRONTEND_PORT} --strictPort`,
      cwd: path.join(__dirname, "../xflyve-frontend"),
      port: FRONTEND_PORT,
      timeout: 60_000,
      reuseExistingServer: false,
      env: {
        VITE_API_URL: `http://localhost:${BACKEND_PORT}/api`,
      },
    },
  ],
});
