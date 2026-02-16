# @petriflow/engine

Petri net workflow engine with guards, executors, timeouts, persistence, and scheduling. Extends [petri-ts](https://github.com/joshuaisaact/petri-ts) with runtime capabilities for building stateful workflows.

Used by [`@petriflow/gate`](../gate) (tool access control) and [`@petriflow/rules`](../rules) (declarative DSL).

## Install

```bash
npm install @petriflow/engine
```

## Usage

```typescript
import { defineWorkflow, toNet, analyse } from "@petriflow/engine";

const workflow = defineWorkflow({
  name: "order",
  places: ["pending", "approved", "shipped"] as const,
  initialMarking: { pending: 1, approved: 0, shipped: 0 },
  transitions: [
    {
      name: "approve",
      inputs: ["pending"],
      outputs: ["approved"],
      guard: (marking) => marking.pending > 0,
    },
    {
      name: "ship",
      inputs: ["approved"],
      outputs: ["shipped"],
    },
  ],
});

// Analyse reachable states, deadlocks, invariants
const result = analyse(workflow);
console.log(result.reachableStates); // 3
console.log(result.deadlockFree);   // false (shipped is terminal)

// Strip extensions for pure petri-ts analysis
const net = toNet(workflow);
```

## Exports

| Export path | Description |
|---|---|
| `@petriflow/engine` | Core engine: workflow definition, guards, executors, scheduling, persistence |
| `@petriflow/engine/analyse` | `analyse()` — reachable states, deadlock detection, invariant checking |
| `@petriflow/engine/workflow` | `defineWorkflow()`, `toNet()` |
| `@petriflow/engine/types` | TypeScript types only |
| `@petriflow/engine/decision` | Decision provider types for human-in-the-loop |

All petri-ts functions and types are re-exported from the main entry point (`canFire`, `fire`, `reachableStates`, `Marking`, `Transition`, etc.).

## Key concepts

**WorkflowTransition** — extends petri-ts `Transition` with optional `guard`, `execute`, `timeout`, and `config` fields. The intersection type (`Transition & { ... }`) ensures structural compatibility with all petri-ts functions — no adapters needed.

**`toNet()`** — strips guard/execute/timeout extensions, returning a plain `PetriNet` for pure analysis with petri-ts functions like `reachableStates()` and `isDeadlockFree()`.

**Persistence** — SQLite adapter via `bun:sqlite` for saving/loading workflow instances, transition history, and timeout entries.

**Scheduler** — tick-based execution loop with re-entrancy protection, timeout handling, and event hooks.

## Tests

```bash
bun test packages/engine
```
