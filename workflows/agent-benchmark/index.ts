import { Scheduler, createExecutor } from "@petriflow/engine";
import { Database } from "bun:sqlite";

export { definition, definition as default, ITERATION_BUDGET } from "./definition";

if (import.meta.main) {
  const { definition } = await import("./definition");
  const db = new Database(":memory:");
  const scheduler = new Scheduler(createExecutor(definition), { db }, {
    onFire: (id, name, result) => {
      console.log(`[${id}] fired: ${name}`);
      if (name === "generate" || name === "iterate") {
        console.log(`  context:`, JSON.stringify(result.context, null, 2));
      }
    },
    onComplete: (id) => console.log(`[${id}] ✓ completed`),
    onError: (id, err) => console.error(`[${id}] ✗ error:`, err),
  });

  await scheduler.createInstance("agent-001");

  for (let i = 0; i < 100; i++) {
    const fired = await scheduler.tick();
    if (fired === 0) break;
  }

  const state = await scheduler.inspect("agent-001");
  console.log("\nFinal state:", JSON.stringify(state, null, 2));
}
