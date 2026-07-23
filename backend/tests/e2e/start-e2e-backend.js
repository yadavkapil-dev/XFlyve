// Boots the REAL backend (server.js, unmodified) against a genuinely
// isolated database for Playwright's E2E workflow test — same isolation
// tool (mongodb-memory-server) already used by tests/integration/testDb.js,
// just driven from a plain spawned process instead of Jest, since this
// server needs to stay up and listening for a real browser to hit it.
//
// This file is spawned as Playwright's `webServer` command (see
// e2e/playwright.config.js), which sets PORT/JWT_SECRET/NODE_ENV/
// RATE_LIMIT_MAX/CORS_WHITELIST as real process env vars before this
// process even starts — so validateEnv() and server.js's own connectDB()
// see everything they need without ever touching backend/.env (this file's
// cwd, set by Playwright, has no .env of its own, so dotenv.config() inside
// server.js finds nothing to load).
//
// Cloudinary is the one real external I/O boundary in the upload path
// (jobPodController -> config/cloudinary.js). The equivalent Jest tests
// stub it with jest.doMock; there is no Jest here, so the exact same
// module is swapped out manually via require.cache before anything else
// requires it — same intent, different mechanism.
const cloudinaryPath = require.resolve("../../config/cloudinary");
require.cache[cloudinaryPath] = {
  id: cloudinaryPath,
  filename: cloudinaryPath,
  loaded: true,
  exports: {
    uploader: {
      // jobPodController pipes the upload buffer into whatever this returns
      // via streamifier(...).pipe(stream); the real SDK's stream supports
      // .write()/.end(), but since the callback below already resolves the
      // controller's awaited Promise synchronously, the subsequent .pipe()
      // call on this plain object throws inside an already-settled Promise
      // executor and is silently discarded (verified behavior) — the exact
      // same shape already proven safe in tests/integration's Cloudinary
      // jest.doMock stub.
      upload_stream: (options, callback) => {
        callback(null, {
          secure_url: `http://localhost/fake-e2e-upload/${Date.now()}.pdf`,
          public_id: `e2e/${Date.now()}`,
        });
        return {};
      },
      destroy: async () => ({ result: "ok" }),
    },
  },
};

const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const { createDriver, createTruck } = require("../integration/factories");

const E2E_ADMIN_EMAIL = "e2e-admin@example.com";
const E2E_DRIVER_EMAIL = "e2e-driver@example.com";
const E2E_DRIVER_NAME = "E2E Driver";
const E2E_TRUCK_NUMBER = "E2E-TRUCK-1";

let mongod;
let shuttingDown = false;

const shutdown = async () => {
  if (shuttingDown) return;
  shuttingDown = true;
  try {
    await mongoose.connection.close();
  } catch {
    // already closed or never opened — fine either way during teardown.
  }
  if (mongod) {
    await mongod.stop();
  }
  process.exit(0);
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGO_URI = mongod.getUri();

  await mongoose.connect(process.env.MONGO_URI);
  await createDriver({ role: "admin", email: E2E_ADMIN_EMAIL, name: "E2E Admin" });
  await createDriver({ role: "driver", email: E2E_DRIVER_EMAIL, name: E2E_DRIVER_NAME });
  await createTruck({ truckNumber: E2E_TRUCK_NUMBER });
  // server.js's own connectDB() opens the real connection the running app
  // uses; release this seeding connection first so there isn't a second,
  // orphaned one sitting on the default mongoose connection.
  await mongoose.connection.close();

  require("../../server.js");
})().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("E2E backend failed to start:", err);
  process.exit(1);
});
