// Invokes a REAL Express controller function (the same one the real route
// uses) against a minimal fake req/res, chaining real role-check middleware
// (the exact requireAdmin/requireDriver functions the Express routes use)
// in front of it first — pass an empty array for routes that only require
// authentication (already guaranteed by the /api/ai/chat route itself), not
// a specific role. An unauthorized tool call gets exactly the same 403
// shape the real route would return, because it's the same code running,
// not a re-implemented copy of the rule that could drift from it. Tool
// results likewise can never drift from what the real HTTP endpoint would
// return, since this is the exact same controller function, not a
// reimplementation of its query/business logic.
const runProtected = (middlewareFns, controllerFn, req) =>
  new Promise((resolve) => {
    const res = {
      statusCode: 200,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(body) {
        resolve({ statusCode: this.statusCode, body });
        return this;
      },
    };

    let index = 0;
    const next = (err) => {
      if (err) {
        resolve({ statusCode: 500, body: { status: "error", message: "Internal error" } });
        return;
      }
      const middleware = middlewareFns[index++];
      if (middleware) {
        middleware(req, res, next);
        return;
      }
      Promise.resolve(controllerFn(req, res)).catch(() => {
        resolve({ statusCode: 500, body: { status: "error", message: "Internal error" } });
      });
    };

    next();
  });

// Builds the fake req passed to a controller. `user` must always be the
// real, authenticated req.user from the /api/ai/chat request — never
// anything derived from LLM output. `query`/`params` are fixed values this
// module writes itself (e.g. { status: "available" }); tool functions never
// forward LLM/tool-call arguments into this.
const buildReq = (user, { query = {}, params = {} } = {}) => ({ user, query, params, body: {} });

module.exports = { runProtected, buildReq };
