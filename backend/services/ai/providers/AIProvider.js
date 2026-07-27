// Minimal provider contract so a second provider (e.g. Grok) could slot in
// later without touching aiService.js's tool-calling loop — it only ever
// calls `provider.chat(...)` and expects this exact return shape back.
class AIProvider {
  /**
   * @param {{ messages: Array<object>, tools?: Array<object> }} params
   * @returns {Promise<{ role: string, content: string|null, tool_calls?: Array<object> }>}
   *   The normalized assistant message — OpenAI/OpenRouter's own chat
   *   completion message shape, since that's the lowest common denominator
   *   any OpenAI-compatible provider (OpenRouter, Grok, etc.) already
   *   returns natively.
   */
  async chat(_params) {
    throw new Error(`${this.constructor.name} must implement chat()`);
  }
}

module.exports = AIProvider;
