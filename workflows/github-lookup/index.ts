import { Scheduler, createExecutor, sqliteAdapter } from "@petriflow/engine";
import { Database } from "bun:sqlite";

export { definition, definition as default } from "./definition";

if (import.meta.main) {
  const { definition, USERNAME } = await import("./definition");
  const db = new Database(":memory:");
  const scheduler = new Scheduler(createExecutor(definition), { adapter: sqliteAdapter(db, definition.name) }, {
    onFire: (id, name, result) => {
      console.log(`\n[${id}] fired: ${name}`);
      const nodeResult = result.context[name as keyof typeof result.context] as
        | { status: number; ok: boolean; data: unknown }
        | null;
      if (nodeResult) {
        console.log(`  status: ${nodeResult.status} (ok: ${nodeResult.ok})`);
        if (name === "fetchUser" && typeof nodeResult.data === "object" && nodeResult.data) {
          const u = nodeResult.data as Record<string, unknown>;
          console.log(`  user: ${u.login} — ${u.name}`);
          console.log(`  bio: ${u.bio}`);
          console.log(`  public repos: ${u.public_repos}`);
        }
        if (name === "fetchRepos" && Array.isArray(nodeResult.data)) {
          console.log(`  top ${nodeResult.data.length} repos:`);
          for (const repo of nodeResult.data) {
            const r = repo as Record<string, unknown>;
            console.log(`    - ${r.name} ★${r.stargazers_count} (${r.language ?? "n/a"})`);
          }
        }
      }
    },
    onComplete: (id) => console.log(`\n[${id}] ✓ completed — looked up github.com/${USERNAME}`),
    onError: (id, err) => console.error(`[${id}] ✗ error:`, err),
  });

  await scheduler.createInstance("lookup-001");

  for (let i = 0; i < 10; i++) {
    const fired = await scheduler.tick();
    if (fired === 0) break;
  }
}
