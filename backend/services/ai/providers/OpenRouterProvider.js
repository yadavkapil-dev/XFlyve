const AIProvider = require("./AIProvider");
const logger = require("../../../utils/logger");

const OPENROUTER_CHAT_URL = "https://openrouter.ai/api/v1/chat/completions";

// Hardcoded per Phase 14 — pinned to the free tier deliberately. Do not make
// this swappable to a paid model without an explicit future decision; if a
// second provider is ever added, it gets its own hardcoded model constant
// the same way, not a shared config.
//
// Originally pinned to meta-llama/llama-3.3-70b-instruct:free, but that
// specific free-tier slug was pulled from OpenRouter without notice (a
// live request came back 404, telling us to use the paid slug instead) —
// a known, common occurrence with free-tier models rotating out
// unpredictably. Switched to "openrouter/free", OpenRouter's own
// auto-router: it always resolves to a currently-available free model
// filtered for tool-calling support, so this trades away pinned
// reproducibility (we can no longer name the exact model that will answer
// a given request) for resilience against the next rotation — a better
// trade for this app than re-pinning to whatever happens to be free today
// and repeating this same breakage later.
const MODEL = "openrouter/free";

const REQUEST_TIMEOUT_MS = 20_000;

class OpenRouterProvider extends AIProvider {
  constructor(apiKey = process.env.OPENROUTER_API_KEY) {
    super();
    this.apiKey = apiKey;
  }

  async chat({ messages, tools }) {
    if (!this.apiKey) {
      throw new Error("OPENROUTER_API_KEY not configured");
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    let response;
    try {
      response = await fetch(OPENROUTER_CHAT_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
          // Recommended by OpenRouter for attributing usage — not required,
          // harmless if FRONTEND_URL is unset.
          "HTTP-Referer": process.env.FRONTEND_URL || "https://xflyve.app",
          "X-Title": "XFlyve",
        },
        body: JSON.stringify({
          model: MODEL,
          messages,
          ...(tools?.length ? { tools, tool_choice: "auto" } : {}),
        }),
        signal: controller.signal,
      });
    } catch (err) {
      if (err.name === "AbortError") {
        throw new Error("OpenRouter request timed out");
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }

    const payload = await response.json().catch(() => null);

    if (!response.ok || !payload) {
      const message = payload?.error?.message || `OpenRouter request failed with status ${response.status}`;
      logger.error("OpenRouter API error: %o", { status: response.status, message });
      throw new Error(message);
    }

    const choice = payload.choices?.[0];
    if (!choice?.message) {
      throw new Error("OpenRouter returned no completion choices");
    }

    return choice.message;
  }
}

module.exports = OpenRouterProvider;
module.exports.MODEL = MODEL;
