// Genuinely isolated integration test database.
//
// Isolation guarantee: MongoMemoryServer starts a REAL standalone `mongod`
// binary, but bound to an OS-assigned ephemeral port on localhost, backed
// entirely by an in-memory/temp-directory dataset it creates itself and
// deletes on stop() — it never reads or writes any existing MongoDB data
// directory, and never touches the MONGO_URI configured in .env (that
// variable is simply never read: server.js is the only file in this repo
// that calls dotenv.config(), and these tests require app.js directly,
// never server.js — so process.env.MONGO_URI is never consulted here at
// all). Each test file below calls startTestDb() in beforeAll to spin up
// its own fresh instance and stopTestDb() in afterAll to tear it down —
// there is no shared state between test files, and nothing here can ever
// resolve to a real dev/staging/production database.
const { MongoMemoryServer } = require("mongodb-memory-server");
const mongoose = require("mongoose");

let mongod;

const startTestDb = async () => {
  mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();
  await mongoose.connect(uri);
  return uri;
};

const stopTestDb = async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.connection.close();
  if (mongod) {
    await mongod.stop();
    mongod = undefined;
  }
};

const clearTestDb = async () => {
  const { collections } = mongoose.connection;
  await Promise.all(Object.values(collections).map((collection) => collection.deleteMany({})));
};

module.exports = { startTestDb, stopTestDb, clearTestDb };
