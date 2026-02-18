# PetriFlow

Provably safe AI agents. Rules your agent **cannot** break. Any framework. One safety layer.

PetriFlow compiles declarative safety rules into Petri nets that gate every tool call. Each rule is verified exhaustively before your agent starts. If the verifier says "safe," it means safe in every possible execution, not just the ones you tested.

```
# safety.rules
require backup before delete
require human-approval before deploy
limit discord.sendMessage to 5 per session
block rm
```

```ts
import { loadRules } from "@petriflow/rules";
import { createPetriflowGate } from "@petriflow/vercel-ai";

const { nets } = await loadRules("./safety.rules");
const gate = createPetriflowGate(nets);

await generateText({
  tools: gate.wrapTools({ bash, delete, backup }),
  system: gate.systemPrompt(),
});
```

## Quick start

```bash
bun install
bun test
```

Run an example agent (requires an API key for the model provider):

```bash
bun run examples/01-file-management/agent.ts
```

## Safety layer packages

The core product: a framework-agnostic tool gating system with adapter packages for specific agent runtimes.

| Package | Description |
|---|---|
| `@petriflow/gate` | Framework-agnostic tool gating. Skill nets, deferred transitions, tool mapping, multi-net composition |
| `@petriflow/rules` | Declarative rules DSL. Compiles one-liner safety policies into verified skill nets |
| `@petriflow/vercel-ai` | [Vercel AI SDK](https://sdk.vercel.ai) adapter. Wraps tool `execute` methods with gating |
| `@petriflow/pi-extension` | [pi-mono](https://github.com/nicholasgasior/pi-mono) adapter. Intercepts tool calls and enforces net structure |
| `@petriflow/claude-code` | [Claude Code](https://claude.ai/code) hook. Gates bash, file, and MCP tools via the hook system |
| `@petriflow/openclaw` | [OpenClaw](https://github.com/nicholasgasior/openclaw) adapter. Maps gate concepts to OpenClaw hooks |
| `@petriflow/pi-assistant` | Four reusable skill nets: safe messaging, staged deploys, research-before-share, backup-before-delete |

### How it works

Each rule compiles to a small, independent Petri net. At runtime every net is checked on every tool call. A tool can only fire if **all** nets allow it.

Key mechanisms:
- **Deferred transitions** allow the tool call immediately, but only advance the net when the tool succeeds (e.g. backup must actually work before delete is unlocked)
- **Tool mapping** splits one tool (e.g. `bash`) into virtual tools based on command content (`map bash.command rm as delete`)
- **Multi-net composition** means rules compose by intersection. `require lint before test` + `require test before deploy` = `lint → test → deploy`, without the nets knowing about each other
- **Exhaustive verification** enumerates every reachable state at compile time. Small nets, big guarantees.

### Rules DSL

```
require A before B              # A must succeed before B is allowed
require human-approval before B # manual gate every time
block A                         # permanently blocked
limit A to N per session        # N uses total
limit A to N per action         # N uses, refills when action fires
map tool.field pattern as name  # pattern-match tool inputs into virtual names
```

Full docs: [petriflow.joshtuddenham.dev](https://petriflow.joshtuddenham.dev)

### Examples

Three runnable Vercel AI SDK agents in `examples/`:

| Example | What it demonstrates | |
|---|---|---|
| `01-file-management` | Deferred transitions (backup must succeed), permanent blocks (`rm`), sequence gates | [Tutorial](https://petriflow.joshtuddenham.dev/docs/tutorial-file-safety/) |
| `02-deployment` | Human approval gates, multi-rule composition (`lint → test → deploy`) | [Tutorial](https://petriflow.joshtuddenham.dev/docs/tutorial-deployment/) |
| `03-discord-bot` | Dot-notation action dispatch, session rate limiting | [Tutorial](https://petriflow.joshtuddenham.dev/docs/tutorial-discord-bot/) |

---

## Workflow runtime

Separate from the safety layer, PetriFlow also includes a general-purpose workflow execution engine. This extends [petri-ts](https://github.com/joshuaisaact/petri-net) with guards, side-effect execution, timeouts, persistence, scheduling, and analysis.

| Package | Description |
|---|---|
| `@petriflow/engine` | Core types, firing engine, scheduler, pluggable persistence (SQLite included), analysis |
| `@petriflow/server` | HTTP API. Run workflows as a service, inject tokens via REST, observe via SSE |
| `@petriflow/viewer` | Interactive React app. Click to fire transitions, live analysis, visual editor |
| `@petriflow/cli` | `petriflow analyse <workflow.ts>`. Prove properties from the command line |

### Workflows

Six example workflows in `workflows/`:

| Workflow | What it proves |
|---|---|
| `coffee` | Concurrency. `heatWater` and `grindBeans` fire independently, `pourOver` joins them |
| `github-lookup` | Real HTTP calls as transitions |
| `contract-approval` | Parallel approval gates. Finance and legal review independently |
| `order-checkout` | Resource contention. Cannot oversell inventory |
| `simple-agent` | Iteration loop with budget. Agent forced to respond when exhausted |
| `agent-benchmark` | Everything together: guards, executors, timeouts, human approval, deferred transitions |

### Running workflows

```bash
# Viewer + API server
bun dev

# Run a workflow directly
bun run workflows/coffee/index.ts

# Analyse a workflow
bun packages/cli/src/cli.ts analyse workflows/agent-benchmark/index.ts

# Strict mode (exits 1 on issues, use in CI)
bun packages/cli/src/cli.ts analyse workflows/order-checkout/index.ts --strict
```

### Engine usage

```ts
import { defineWorkflow, createExecutor, analyse, Scheduler, sqliteAdapter } from "@petriflow/engine";
import { Database } from "bun:sqlite";

const definition = defineWorkflow({
  name: "my-workflow",
  places: ["start", "end"],
  transitions: [
    {
      name: "go",
      type: "script",
      inputs: ["start"],
      outputs: ["end"],
      guard: "ready",
      execute: async (ctx) => ({ done: true }),
    },
  ],
  initialMarking: { start: 1, end: 0 },
  initialContext: { ready: true, done: false },
  terminalPlaces: ["end"],
});

// Prove properties before running
const result = analyse(definition);

// Run it
const db = new Database(":memory:");
const executor = createExecutor(definition);
const scheduler = new Scheduler(executor, { adapter: sqliteAdapter(db, definition.name) });
await scheduler.createInstance("instance-1");
await scheduler.tick();
```

### HTTP server

```bash
bun run packages/server/src/main.ts workflows/coffee/definition.ts
```

```
GET    /definitions                    List all workflows
POST   /workflows/:name/instances      Create instance
GET    /instances/:id                  Inspect state
POST   /instances/:id/inject           Inject token (webhooks, approvals)
GET    /events                         SSE stream
```

### Persistence

The scheduler takes a pluggable `WorkflowPersistence` adapter. SQLite is included; implement the interface for Postgres, Redis, or in-memory.

---

## Built with

- [petri-ts](https://www.npmjs.com/package/petri-ts) Petri net engine and analysis
- [Bun](https://bun.sh) runtime, test runner, package manager
- [Turborepo](https://turbo.build) monorepo orchestration
- [Hono](https://hono.dev) HTTP router for the server
- [React Flow](https://reactflow.dev) graph rendering for the viewer
