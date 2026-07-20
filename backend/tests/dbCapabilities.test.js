// Loads a fresh copy of both mongoose and dbCapabilities together (in the
// same jest.resetModules() scope) so mutating mongoose.connection.db here
// is visible to the module under test — resetModules() gives each require()
// its own instance, so a mongoose reference from outside this scope
// wouldn't be the same object dbCapabilities.js sees internally.
const loadModule = () => {
  jest.resetModules();
  const mongoose = require("mongoose");
  const { supportsTransactions } = require("../utils/dbCapabilities");
  return { supportsTransactions, mongoose };
};

const setFakeDb = (mongoose, command) => {
  mongoose.connection.db = { admin: () => ({ command }) };
};

describe("dbCapabilities.supportsTransactions", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("returns true for a replica set (hello response includes setName)", async () => {
    const { supportsTransactions, mongoose } = loadModule();
    setFakeDb(mongoose, jest.fn().mockResolvedValue({ setName: "rs0", isWritablePrimary: true }));

    await expect(supportsTransactions()).resolves.toBe(true);
  });

  test("returns true for a sharded cluster (hello response msg is isdbgrid)", async () => {
    const { supportsTransactions, mongoose } = loadModule();
    setFakeDb(mongoose, jest.fn().mockResolvedValue({ msg: "isdbgrid" }));

    await expect(supportsTransactions()).resolves.toBe(true);
  });

  test("returns false for a standalone mongod (no setName, no isdbgrid)", async () => {
    const { supportsTransactions, mongoose } = loadModule();
    setFakeDb(mongoose, jest.fn().mockResolvedValue({ isWritablePrimary: true }));

    await expect(supportsTransactions()).resolves.toBe(false);
  });

  test("returns false (never throws) if the topology check itself fails", async () => {
    const { supportsTransactions, mongoose } = loadModule();
    setFakeDb(mongoose, jest.fn().mockRejectedValue(new Error("not connected")));

    await expect(supportsTransactions()).resolves.toBe(false);
  });

  test("caches the result across calls (topology command runs once)", async () => {
    const { supportsTransactions, mongoose } = loadModule();
    const command = jest.fn().mockResolvedValue({ setName: "rs0" });
    setFakeDb(mongoose, command);

    await supportsTransactions();
    await supportsTransactions();

    expect(command).toHaveBeenCalledTimes(1);
  });
});
