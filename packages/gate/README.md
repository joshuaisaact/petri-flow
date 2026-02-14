# @petriflow/gate

Framework-agnostic Petri net gating for AI agent tool access control. Define safety constraints as Petri nets — tools are only allowed when an enabled transition permits them.

Built on [`@petriflow/engine`](../engine). Used by [`@petriflow/pi-extension`](../pi-extension) (pi-mono) and [`@petriflow/openclaw`](../openclaw) (OpenClaw).

## Why

LLM agents need guardrails, but hardcoded allow/deny lists are too rigid and per-call confirmation is too noisy. Petri nets let you express **stateful** safety constraints: "allow delete only after a successful backup", "allow push only after commit", "allow sending a message only after reading the channel".

This package provides the core gating logic with no framework dependencies — adapter packages wire it into specific agent runtimes.

## Defining a skill net

```ts
import { defineSkillNet } from "@petriflow/gate";

const toolApproval = defineSkillNet({
  name: "tool-approval",
  places: ["idle", "ready"],
  terminalPlaces: [],
  freeTools: ["ls", "read", "grep", "find"],  // Always allowed
  initialMarking: { idle: 1, ready: 0 },
  transitions: [
    { name: "start", type: "auto", inputs: ["idle"], outputs: ["ready"] },
    { name: "execShell", type: "manual", inputs: ["ready"], outputs: ["ready"], tools: ["bash"] },
    { name: "execWrite", type: "manual", inputs: ["ready"], outputs: ["ready"], tools: ["write", "edit"] },
  ],
});
```

## Key concepts

### Transition types

- **`auto`** — fires immediately when the tool is called and the transition is enabled
- **`manual`** — requires human approval via `ctx.confirm()` before firing

### Free tools

Tools listed in `freeTools` are always allowed regardless of net state. Use this for read-only, side-effect-free tools.

### Tool mapping

Split one physical tool into multiple virtual tools based on input content:

```ts
const net = defineSkillNet({
  // ...
  toolMapper: (event) => {
    if (event.toolName !== "bash") return event.toolName;
    const cmd = event.input.command as string;
    if (/\bgit\s+commit\b/.test(cmd)) return "git-commit";
    if (/\bgit\s+push\b/.test(cmd)) return "git-push";
    return "bash";
  },
  freeTools: ["bash"],  // Plain bash is free
  transitions: [
    { name: "commit", type: "manual", inputs: ["working"], outputs: ["committed"], tools: ["git-commit"] },
    { name: "push", type: "manual", inputs: ["committed"], outputs: ["working"], tools: ["git-push"] },
  ],
});
```

### Deferred transitions

Allow the tool call immediately but only advance the net when the tool succeeds:

```ts
{
  name: "backup",
  type: "auto",
  inputs: ["ready"],
  outputs: ["backedUp"],
  tools: ["backup"],
  deferred: true,  // Fires on successful tool_result, not tool_call
}
```

If the tool fails (`isError: true`), the transition doesn't fire and the marking stays unchanged.

### Semantic validation

Add domain-specific checks beyond what net structure alone enforces:

```ts
const net = defineSkillNet({
  // ...
  validateToolCall: (event, resolvedTool, transition, state) => {
    if (resolvedTool === "destructive") {
      const target = extractTarget(event.input);
      const covered = state.meta.backedUpPaths.some(p => covers(p, target));
      if (!covered) return { block: true, reason: `Target '${target}' not backed up` };
    }
  },
  onDeferredResult: (event, resolvedTool, transition, state) => {
    // Record metadata when a deferred transition resolves
    state.meta.backedUpPaths.push(extractPath(event.input));
  },
});
```

## Using the gate

### Single net (low-level)

```ts
import { handleToolCall, handleToolResult, createGateState, autoAdvance } from "@petriflow/gate";

const state = createGateState(autoAdvance(net, { ...net.initialMarking }));

const decision = await handleToolCall(
  { toolCallId: "1", toolName: "bash", input: { command: "rm -rf build/" } },
  { hasUI: true, confirm: async (title, msg) => window.confirm(msg) },
  net,
  state,
);

if (decision?.block) {
  console.log(`Blocked: ${decision.reason}`);
}
```

### Multi-net composition (GateManager)

```ts
import { createGateManager } from "@petriflow/gate";

// Static — all nets always active
const manager = createGateManager([netA, netB]);

// Registry — dynamic activation/deactivation
const manager = createGateManager({
  registry: { netA, netB, netC },
  active: ["netA"],
});

const decision = await manager.handleToolCall(event, ctx);
manager.handleToolResult(resultEvent);
manager.addNet("netB");     // Registry mode only
manager.removeNet("netA");  // Registry mode only
manager.formatStatus();     // "netA (active): ready:1\nnetB (inactive): idle:1"
manager.formatSystemPrompt(); // Markdown for LLM context
```

### Composition semantics

When multiple nets are composed, each net independently classifies a tool call:

| Verdict | Meaning |
|---|---|
| **free** | Tool is in the net's `freeTools` — always allowed |
| **abstain** | Tool doesn't appear in any of the net's transitions — no opinion |
| **gated** | An enabled transition covers this tool — allowed (pending approval/validation) |
| **blocked** | The net has jurisdiction but no enabled transition — rejected |

One **blocked** verdict from any net rejects the call. If no net blocks, **gated** nets fire their transitions. If all nets are **free** or **abstain**, the call passes through.

## API

| Export | Description |
|---|---|
| `defineSkillNet(config)` | Type-safe skill net constructor |
| `createGateManager(input)` | Multi-net manager (array or registry config) |
| `handleToolCall(event, ctx, net, state)` | Single-net tool call gating |
| `handleToolResult(event, net, state)` | Single-net deferred resolution |
| `autoAdvance(net, marking)` | Fire structural (non-tool) auto transitions |
| `createGateState(marking)` | Initialize gate state with marking |
| `classifyNets(nets, states, event)` | Phase 1 structural check (non-mutating) |
| `composedToolCall(getNets, getStates, event, ctx)` | Full 4-phase composed gating |
| `formatMarking(marking)` | Format marking for display (`"ready:1, working:0"`) |
| `getEnabledToolTransitions(net, marking)` | List currently available tool transitions |
| `resolveTool(net, event)` | Apply tool mapper |

## Tests

```bash
bun test packages/gate
```
