// Unit tests for OpenRouterProvider — global fetch is mocked throughout,
// so none of these make a real network call or hit OpenRouter's actual
// API (see the standing instruction: automated tests must never spend
// real OpenRouter quota).
const ORIGINAL_ENV = process.env;

const loadProvider = () => {
  jest.resetModules();
  process.env = { ...ORIGINAL_ENV };
  const OpenRouterProvider = require("../services/ai/providers/OpenRouterProvider");
  return OpenRouterProvider;
};

afterEach(() => {
  process.env = ORIGINAL_ENV;
  jest.restoreAllMocks();
});

describe("OpenRouterProvider: request construction", () => {
  test("sends the exact configured MODEL and calls OpenRouter's chat completions endpoint", async () => {
    const OpenRouterProvider = loadProvider();
    const fetchSpy = jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { role: "assistant", content: "hi" } }] }),
    });

    const provider = new OpenRouterProvider("test-key");
    await provider.chat({ messages: [{ role: "user", content: "hello" }] });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, options] = fetchSpy.mock.calls[0];
    expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(options.headers.Authorization).toBe("Bearer test-key");

    const body = JSON.parse(options.body);
    // Asserts against the exported constant rather than a hardcoded string
    // — this exact model string has already rotated out from under this
    // app once (see OpenRouterProvider.js's MODEL comment); the request
    // shape is what this test cares about, not which model string wins.
    expect(body.model).toBe(OpenRouterProvider.MODEL);
    expect(body.messages).toEqual([{ role: "user", content: "hello" }]);
  });

  test("omits the tools/tool_choice fields entirely when no tools are passed", async () => {
    const OpenRouterProvider = loadProvider();
    const fetchSpy = jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { role: "assistant", content: "hi" } }] }),
    });

    const provider = new OpenRouterProvider("test-key");
    await provider.chat({ messages: [{ role: "user", content: "hello" }] });

    const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(body.tools).toBeUndefined();
    expect(body.tool_choice).toBeUndefined();
  });

  test("includes tools + tool_choice: auto when tools are passed", async () => {
    const OpenRouterProvider = loadProvider();
    const fetchSpy = jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { role: "assistant", content: "hi" } }] }),
    });

    const provider = new OpenRouterProvider("test-key");
    const tools = [{ type: "function", function: { name: "getAvailableTrucks", parameters: {} } }];
    await provider.chat({ messages: [{ role: "user", content: "hello" }], tools });

    const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(body.tools).toEqual(tools);
    expect(body.tool_choice).toBe("auto");
  });

  test("throws if no API key is configured, without ever calling fetch", async () => {
    const OpenRouterProvider = loadProvider();
    const fetchSpy = jest.spyOn(global, "fetch");

    const provider = new OpenRouterProvider(undefined);
    await expect(provider.chat({ messages: [] })).rejects.toThrow("OPENROUTER_API_KEY not configured");
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("OpenRouterProvider: failure handling", () => {
  test("throws with the API's error message when the response is not ok", async () => {
    const OpenRouterProvider = loadProvider();
    jest.spyOn(global, "fetch").mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({ error: { message: "Rate limit exceeded" } }),
    });

    const provider = new OpenRouterProvider("test-key");
    await expect(provider.chat({ messages: [] })).rejects.toThrow("Rate limit exceeded");
  });

  test("throws a generic message when the error response has no parseable body", async () => {
    const OpenRouterProvider = loadProvider();
    jest.spyOn(global, "fetch").mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => {
        throw new Error("not json");
      },
    });

    const provider = new OpenRouterProvider("test-key");
    await expect(provider.chat({ messages: [] })).rejects.toThrow("503");
  });

  test("throws when the response has no completion choices", async () => {
    const OpenRouterProvider = loadProvider();
    jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ choices: [] }),
    });

    const provider = new OpenRouterProvider("test-key");
    await expect(provider.chat({ messages: [] })).rejects.toThrow("no completion choices");
  });

  test("aborts and throws a timeout error if the request takes too long", async () => {
    jest.useFakeTimers();
    const OpenRouterProvider = loadProvider();
    jest.spyOn(global, "fetch").mockImplementation((_url, options) => {
      return new Promise((_resolve, reject) => {
        options.signal.addEventListener("abort", () => {
          const err = new Error("aborted");
          err.name = "AbortError";
          reject(err);
        });
      });
    });

    const provider = new OpenRouterProvider("test-key");
    const chatPromise = provider.chat({ messages: [] });
    const assertion = expect(chatPromise).rejects.toThrow("timed out");

    // Advance past REQUEST_TIMEOUT_MS (20s) to trigger the AbortController
    // without actually waiting 20 real seconds.
    await jest.advanceTimersByTimeAsync(20_000);
    await assertion;

    jest.useRealTimers();
  });

  test("returns the assistant message unmodified on success, including tool_calls", async () => {
    const OpenRouterProvider = loadProvider();
    const assistantMessage = {
      role: "assistant",
      content: null,
      tool_calls: [{ id: "call_1", function: { name: "getAvailableTrucks", arguments: "{}" } }],
    };
    jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: assistantMessage }] }),
    });

    const provider = new OpenRouterProvider("test-key");
    const result = await provider.chat({ messages: [] });

    expect(result).toEqual(assistantMessage);
  });
});
