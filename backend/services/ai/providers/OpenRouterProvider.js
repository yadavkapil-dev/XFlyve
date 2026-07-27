const AIProvider = require("./AIProvider");
const logger = require("../../../utils/logger");

const OPENROUTER_CHAT_URL = "https://openrouter.ai/api/v1/chat/completions";

// Hardcoded per Phase 14 — pinned to the free tier deliberately. Do not make
// this swappable to a paid model without an explicit future decision; if a
// second provider is ever added, it gets its own hardcoded model constant
// the same way, not a shared config.
const MODEL = "meta-llama/llama-3.3-70b-instruct:free";

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
