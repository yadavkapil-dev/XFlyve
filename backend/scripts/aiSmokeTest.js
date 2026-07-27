// MANUAL / OPTIONAL SMOKE TEST — not run by the automated test suite (no
// *.test.js suffix, so Jest never picks this up), and never invoked by CI.
//
// Makes a REAL network call to OpenRouter using the real OPENROUTER_API_KEY
// from .env, and counts against that account's free-tier daily quota. Run
// it yourself, on purpose, when you want to eyeball a real model response:
//
//   node scripts/aiSmokeTest.js
//   node scripts/aiSmokeTest.js "What can you help me with?"
//
// This exercises the provider layer (services/ai/providers/OpenRouterProvider.js)
// directly, including whether whichever free model OpenRouter's auto-router
// (openrouter/free — see OpenRouterProvider.js's MODEL constant for why it's
// not pinned to one specific model) resolves this request to actually
// honors function-calling with the same tool schemas aiService.js sends —
// that's model-specific behavior no mock can verify, and worth re-running
// this after OpenRouter's free-tier lineup changes. It does NOT execute any
// real tool against the database (no authenticated user/session here), so
// if the model attempts a tool call, this script just prints what it asked
// for instead of running it.
require("dotenv").config();

const OpenRouterProvider = require("../services/ai/providers/OpenRouterProvider");
const { TOOL_DEFINITIONS } = require("../services/ai/aiService");

const toOpenAiToolSchema = (def) => ({
  type: "function",
  function: {
    name: def.name,
    description: def.description,
    parameters: { type: "object", properties: {}, additionalProperties: false },
  },
});

const main = async () => {
  if (!process.env.OPENROUTER_API_KEY) {
    console.error("OPENROUTER_API_KEY is not set in .env — nothing to test against. Stopping.");
    process.exitCode = 1;
    return;
  }

  const userMessage = process.argv[2] || "What can you help me with?";
  console.log(`Model: ${OpenRouterProvider.MODEL}`);
  console.log(`Sending: "${userMessage}"\n`);

  const provider = new OpenRouterProvider();
  const messages = [
    {
      role: "system",
      content:
        "You are XFlyve's operations assistant. You may only answer using the tools provided — never from general knowledge.",
    },
    { role: "user", content: userMessage },
  ];

  const reply = await provider.chat({ messages, tools: TOOL_DEFINITIONS.map(toOpenAiToolSchema) });

  if (reply.tool_calls?.length) {
    console.log("Model requested tool call(s) (not executed by this script):");
    for (const call of reply.tool_calls) {
      console.log(`  - ${call.function.name}(${call.function.arguments || "{}"})`);
    }
  } else {
    console.log("Model replied directly:\n");
    console.log(reply.content);
  }
};

main().catch((err) => {
  console.error("Smoke test failed:", err.message);
  process.exitCode = 1;
});
