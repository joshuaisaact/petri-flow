# PetriFlow

A workflow orchestration engine built on [petri-ts](https://github.com/joshuaisaact/petri-net). Extends Petri net semantics with guard functions, side-effect execution, timeouts, pluggable persistence, a polling scheduler, and a CLI analyser.

## Why

DAG-based workflow tools (n8n, Airflow, Temporal) can't express concurrent synchronization, resource contention, or pre-deployment reachability analysis. Petri nets can. PetriFlow makes them practical.

- **Guards** route workflows based on runtime context (contract value, confidence score, inventory level)
- **Execute functions** run side effects and merge context between steps
- **The scheduler** polls active instances, fires enabled transitions, and persists state via a pluggable adapter (SQLite included)
- **The analyser** proves properties about your workflow before it runs — deadlock freedom, token conservation, reachable states

## Packages

| Package | Description |
|---|---|
| `@petriflow/engine` | Core types, engine, scheduler, pluggable persistence (SQLite adapter included), analysis |
| `@petriflow/server` | HTTP server — run workflows as a service, inject tokens via REST, observe via SSE |
| `@petriflow/cli` | `petriflow analyse <workflow.ts>` CLI tool |
| `@petriflow/viewer` | Interactive Petri net viewer — click to fire transitions, live analysis |

## Workflows

| Workflow | What it proves |
|---|---|
| `coffee` | Concurrency and synchronisation. `heatWater` and `grindBeans` fire independently, `pourOver` joins them with a temperature guard. |
| `simple-agent` | Iteration loop with budget tokens. Agent is structurally forced to respond when budget is exhausted. |
| `order-checkout` | Cannot oversell inventory. `reserve_stock` consumes from a shared `inventory` place. Every order terminates. |
| `agent-benchmark` | Termination, human approval gate, no orphaned work, bounded iterations. See [BENCHMARK.md](./BENCHMARK.md). |

## Viewer

An interactive React app for exploring Petri nets. Click enabled transitions to fire them, watch tokens flow, and see live reachability analysis.

```bash
bun run --filter=@petriflow/viewer dev
```

Four nets tell a progressive story:

| Net | Places | Transitions | What it teaches |
|---|---|---|---|
| **coffee** | 6 | 3 | Concurrency and synchronisation — `heatWater` and `grindBeans` fire independently, `pourOver` joins them |
| **order-checkout** | 6 | 3 | Resource contention — `reserve_stock` consumes from a shared `inventory` place with token count > 1 |
| **simple-agent** | 6 | 5 | Iteration loop with budget — watch the budget deplete, agent forced to respond when spent |
| **agent-benchmark** | 16 | 17 | Everything together — concurrent tool fan-out, human approval gate, join semantics, four safety proofs |

Features:

- **Click to fire** — click any enabled transition, watch marking update in real-time
- **Auto-play** — random firing with adjustable speed, stops at terminal state
- **Live analysis** — reachable states, terminal states, deadlock-free status, safety properties and invariants
- **Token display** — toggle between numbers and traditional Petri net dot notation
- **Light/dark theme** — toggle in the header

Built with React 19, React Flow, dagre layout, framer-motion, and Tailwind CSS v4. Uses `@petriflow/engine/analyse` for workflow-aware analysis (distinguishes valid terminal states from true deadlocks).

## Quick start

```bash
bun install
```

Run a workflow end-to-end:

```bash
bun run workflows/coffee/index.ts
bun run workflows/simple-agent/index.ts
bun run workflows/order-checkout/index.ts
bun run workflows/agent-benchmark/index.ts
```

Run with LLM decision-making (requires an Anthropic API key):

```bash
ANTHROPIC_API_KEY=sk-... bun run workflows/simple-agent/run-llm.ts
```

Analyse a workflow:

```bash
bun packages/cli/src/cli.ts analyse workflows/agent-benchmark/index.ts
```

With `--strict` (exits 1 on unexpected terminal states or invariant violations — use in CI):

```bash
bun packages/cli/src/cli.ts analyse workflows/order-checkout/index.ts --strict
```

Run all tests:

```bash
bun test
```

## How it works

`WorkflowTransition` is an intersection type with petri-ts's `Transition`, adding optional `guard`, `execute`, and `timeout`. Because TypeScript uses structural typing, a `WorkflowNet` passes directly to all petri-ts analysis functions — no conversion needed.

When you need a clean `PetriNet` (for serialization or analysis), `toNet()` strips the extensions. The analyser calls `petri-ts`'s `analyse()` under the hood and adds the workflow name.

```ts
import { defineWorkflow, createExecutor, analyse, Scheduler, sqliteAdapter } from "@petriflow/engine";
import { Database } from "bun:sqlite";

const definition = defineWorkflow({
  name: "my-workflow",
  places: ["start", "end"],
  transitions: [
    {
      name: "go",
      inputs: ["start"],
      outputs: ["end"],
      guard: (ctx) => ctx.ready,
      execute: async (ctx) => ({ done: true }),
    },
  ],
  initialMarking: { start: 1, end: 0 },
  initialContext: { ready: true, done: false },
});

// Prove properties before running
const result = analyse(definition);
// result.isDeadlockFree, result.terminalStates, result.invariants

// Run it
const db = new Database(":memory:");
const executor = createExecutor(definition);
const scheduler = new Scheduler(executor, { adapter: sqliteAdapter(db, definition.name) });
await scheduler.createInstance("instance-1");
await scheduler.tick();
```

## LLM Decision Provider

When multiple transitions are enabled, a `DecisionProvider` calls an LLM to choose which one to fire. When only one transition is enabled it is fired automatically — no LLM call is made.

```ts
type DecisionProvider<Place extends string, Ctx extends Record<string, unknown>> = {
  choose(request: {
    instanceId: string;
    workflowName: string;
    enabled: { name: string; inputs: string[]; outputs: string[] }[];
    marking: Marking<Place>;
    context: Ctx;
  }): Promise<{ transition: string; reasoning: string }>;
};
```

Wire it into the executor, then pass to the Scheduler:

```ts
const executor = createExecutor(definition, { decisionProvider: provider });
const scheduler = new Scheduler(executor, { adapter: sqliteAdapter(db, definition.name) }, {
  onDecision: (id, name, reasoning, candidates) => {
    console.log(`[${id}] LLM chose: ${name} (from ${candidates.join(", ")})`);
    console.log(`  reasoning: ${reasoning}`);
  },
});
```

The `onDecision` event fires after every LLM choice, logging the selected transition, reasoning, and the full candidate list.

## External event injection

`Scheduler.injectToken()` lets external events (webhooks, human approvals, async callbacks) add tokens to running instances:

```ts
// A webhook handler adds an approval token
await scheduler.injectToken("order-123", "approved");
// Next tick() picks it up and fires any newly enabled transitions
```

Injecting a token also reactivates completed instances, so a workflow can pause at a "waiting" state and resume when the external event arrives.

See `workflows/simple-agent/llm-provider.ts` for a reference implementation using the Vercel AI SDK with Claude.

## Timeouts

A transition with a `timeout` field gets deadline-on-waiting semantics. When the transition is structurally enabled (tokens in all input places) but doesn't fire within the deadline — because a guard blocks it, or it's waiting for an external event — a token is injected into the timeout place as a fallback path.

```ts
const definition = defineWorkflow({
  name: "approval-with-timeout",
  places: ["waiting", "timed_out", "approved", "escalated"],
  transitions: [
    {
      name: "approve",
      inputs: ["waiting"],
      outputs: ["approved"],
      guard: (ctx) => ctx.approved,
      timeout: { place: "timed_out", ms: 30_000 }, // 30s deadline
    },
    {
      name: "escalate",
      inputs: ["waiting", "timed_out"],
      outputs: ["escalated"],
    },
  ],
  initialMarking: { waiting: 1, timed_out: 0, approved: 0, escalated: 0 },
  initialContext: { approved: false },
});
```

If `approve` doesn't fire within 30 seconds, the scheduler injects a token into `timed_out`. On the next tick, `escalate` becomes enabled (it needs both `waiting` and `timed_out`) and fires.

Timeouts are cancelled when the transition fires normally or loses structural enablement (another transition consumed its input tokens). The `onTimeout` scheduler event fires when a timeout injects a token:

```ts
const scheduler = new Scheduler(executor, { adapter }, {
  onTimeout: (id, transitionName, place) => {
    console.log(`[${id}] ${transitionName} timed out → injected token into ${place}`);
  },
});
```

## HTTP Server

`@petriflow/server` runs workflows as a long-lived service. Create instances, inject tokens (external events like webhooks or human approvals), and observe state changes via SSE — all over HTTP.

Start the server with one or more workflow definitions:

```bash
bun run packages/server/src/main.ts workflows/coffee/definition.ts workflows/order-checkout/definition.ts
```

Routes:

```
GET    /workflows                      List registered workflows
POST   /workflows/:name/instances      Create instance         { "id": "order-001" }
GET    /workflows/:name/instances      List instances for workflow
GET    /instances/:id                  Inspect instance state
POST   /instances/:id/inject           Inject token            { "place": "payment", "count": 1 }
POST   /workflows/register             Register from file      { "path": "./my-workflow.ts" }
GET    /events                         SSE stream (all events)
GET    /events?workflow=X              SSE filtered by workflow
GET    /events?instance=X              SSE filtered by instance
```

Example — create an instance and watch it run:

```bash
# Terminal 1: stream events
curl -N http://localhost:3000/events

# Terminal 2: create and observe
curl -X POST http://localhost:3000/workflows/coffee/instances \
  -H 'Content-Type: application/json' -d '{"id":"brew-1"}'
curl http://localhost:3000/instances/brew-1
```

For programmatic use, import the runtime directly without the HTTP layer:

```ts
import { Database } from "bun:sqlite";
import { WorkflowRuntime, createServer } from "@petriflow/server";

const runtime = new WorkflowRuntime({ db: new Database(":memory:") });
runtime.register(myDefinition);
runtime.start();

// Optional: expose over HTTP
const server = createServer({ runtime, port: 3000 });
```

The `WorkflowRuntime` class is framework-agnostic — it has no HTTP knowledge. The `createServer` function is a thin Hono layer on top. BYO users can import the runtime and wire their own framework.

## Persistence

The scheduler takes a `WorkflowPersistence` adapter. A SQLite adapter is included:

```ts
import { sqliteAdapter } from "@petriflow/engine";
import { Database } from "bun:sqlite";

const db = new Database("workflows.sqlite");
const adapter = sqliteAdapter(db, "my-workflow");
```

To use a different backend (Postgres, Redis, in-memory for tests), implement the interface:

```ts
import type { WorkflowPersistence } from "@petriflow/engine";

const customAdapter: WorkflowPersistence<MyPlace, MyCtx> = {
  async loadExtended(id) { /* ... */ },
  async saveExtended(id, state) { /* ... */ },
  async listActive() { /* ... */ },
  async scheduleTimeout(entry) { /* ... */ },
  async getExpiredTimeouts(instanceId, now) { /* ... */ },
  async markTimeoutFired(id) { /* ... */ },
  async clearTimeouts(instanceId, transitionName?) { /* ... */ },
  async hasPendingTimeouts(instanceId) { /* ... */ },
};

const scheduler = new Scheduler(executor, { adapter: customAdapter });
```

## Built with

- [petri-ts](https://www.npmjs.com/package/petri-ts) — Petri net engine and analysis
- [Bun](https://bun.sh) — runtime, test runner, bundler
- [Turborepo](https://turbo.build) — monorepo orchestration
- [Hono](https://hono.dev) — HTTP router for the server
- [React Flow](https://reactflow.dev) — graph rendering for the viewer
- [dagre](https://github.com/dagrejs/dagre) — automatic graph layout
- [Vercel AI SDK](https://sdk.vercel.ai) — LLM integration for the decision provider
