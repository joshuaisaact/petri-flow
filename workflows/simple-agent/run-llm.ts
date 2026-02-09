import { Scheduler } from "@petriflow/engine";
import { Database } from "bun:sqlite";
import { definition } from "./definition";
import { createLlmProvider } from "./llm-provider";

const provider = createLlmProvider({ model: "claude-sonnet-4-5-20250929" });
const db = new Database(":memory:");

const scheduler = new Scheduler(definition, { db, decisionProvider: provider }, {
  onDecision: (id, name, reasoning, candidates) => {
    console.log(`[${id}] LLM chose: ${name} (from ${candidates.join(", ")})`);
    console.log(`  reasoning: ${reasoning}`);
  },
  onFire: (id, name, result) => {
    console.log(`[${id}] fired: ${name}`);
  },
  onComplete: (id) => console.log(`[${id}] completed`),
  onError: (id, err) => console.error(`[${id}] error:`, err),
});

await scheduler.createInstance("agent-001");

for (let i = 0; i < 50; i++) {
  const fired = await scheduler.tick();
  if (fired === 0) break;
}

const state = await scheduler.inspect("agent-001");
console.log("\nFinal state:", JSON.stringify(state, null, 2));
