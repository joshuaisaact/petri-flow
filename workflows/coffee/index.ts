import { Scheduler, createExecutor, sqliteAdapter } from "@petriflow/engine";
import { Database } from "bun:sqlite";

export { definition, definition as default } from "./definition";

if (import.meta.main) {
  const { definition } = await import("./definition");
  const db = new Database(":memory:");
  const scheduler = new Scheduler(createExecutor(definition), { adapter: sqliteAdapter(db, definition.name) }, {
    onFire: (id, name, result) => {
      console.log(`[${id}] fired: ${name}`);
      console.log(`  context:`, result.context);
    },
    onComplete: (id) => console.log(`[${id}] ✓ completed`),
    onError: (id, err) => console.error(`[${id}] ✗ error:`, err),
  });

  await scheduler.createInstance("brew-001");

  for (let i = 0; i < 10; i++) {
    const fired = await scheduler.tick();
    if (fired === 0) break;
  }

  const state = await scheduler.inspect("brew-001");
  console.log("\nFinal state:", state);
}
