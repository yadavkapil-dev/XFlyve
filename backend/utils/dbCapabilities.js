const mongoose = require("mongoose");

let cachedSupportsTransactions = null;

/**
 * Multi-document transactions require a replica set or mongos (sharded
 * cluster) — a standalone mongod rejects them outright. This checks the
 * connected topology once and caches the result so callers can safely use
 * transactions where available and fall back to compensated writes where
 * they aren't (e.g. a local standalone MongoDB in development).
 */
const supportsTransactions = async () => {
  if (cachedSupportsTransactions !== null) return cachedSupportsTransactions;

  try {
    const hello = await mongoose.connection.db.admin().command({ hello: 1 });
    cachedSupportsTransactions = Boolean(hello.setName) || hello.msg === "isdbgrid";
  } catch (err) {
    cachedSupportsTransactions = false;
  }

  return cachedSupportsTransactions;
};

// Exposed for tests only — production code should never need to reset this.
const _resetCacheForTests = () => {
  cachedSupportsTransactions = null;
};

module.exports = { supportsTransactions, _resetCacheForTests };
