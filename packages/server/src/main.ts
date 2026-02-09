import { Database } from "bun:sqlite";
import { WorkflowRuntime } from "./runtime.js";
import { createServer } from "./http.js";
import { loadWorkflow } from "./loader.js";

const args = process.argv.slice(2);

if (args.length === 0 || args.includes("--help")) {
  console.log(`Usage: bun run packages/server/src/main.ts <workflow-paths...>

Options:
  --port <port>    HTTP port (default: 3000, or PORT env)
  --db <path>      SQLite database path (default: :memory:, or DATABASE env)
  --help           Show this help`);
  process.exit(0);
}

// Parse flags
let port = Number(process.env.PORT) || 3000;
let dbPath = process.env.DATABASE || ":memory:";
const workflowPaths: string[] = [];

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--port" && args[i + 1]) {
    port = Number(args[++i]);
  } else if (args[i] === "--db" && args[i + 1]) {
    dbPath = args[++i]!;
  } else {
    workflowPaths.push(args[i]!);
  }
}

if (workflowPaths.length === 0) {
  console.error("Error: at least one workflow path required");
  process.exit(1);
}

const db = new Database(dbPath);
const runtime = new WorkflowRuntime({ db });

for (const path of workflowPaths) {
  try {
    const definition = await loadWorkflow(path);
    runtime.register(definition);
    console.log(`Registered workflow: ${definition.name}`);
  } catch (err) {
    console.error(`Failed to load ${path}: ${(err as Error).message}`);
    process.exit(1);
  }
}

runtime.start();
const server = createServer({ runtime, port });
console.log(`PetriFlow server listening on http://localhost:${server.port}`);
