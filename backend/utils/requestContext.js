const { AsyncLocalStorage } = require("async_hooks");

const asyncLocalStorage = new AsyncLocalStorage();

const runWithRequestId = (requestId, callback) => {
  asyncLocalStorage.run({ requestId }, callback);
};

const getRequestId = () => asyncLocalStorage.getStore()?.requestId;

module.exports = { runWithRequestId, getRequestId };
