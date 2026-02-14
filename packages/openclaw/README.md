# @petriflow/openclaw

OpenClaw plugin adapter for Petri net tool gating. Wires [`@petriflow/gate`](../gate) into [OpenClaw](https://github.com/nicholasgasior/openclaw)'s plugin hook lifecycle.

## Why

OpenClaw has a plugin system (`api.on()`, `api.registerCommand()`) but no built-in way to structurally enforce tool access control. This package bridges the gap — define your safety constraints as Petri nets, and the plugin enforces them at every tool call.

## Install

```bash
bun add @petriflow/openclaw
```

## Usage

```ts
import { createPetriGatePlugin, defineSkillNet } from "@petriflow/openclaw";

const toolApproval = defineSkillNet({
  name: "tool-approval",
  places: ["idle", "ready"],
  terminalPlaces: [],
  freeTools: ["ls", "read", "grep", "find"],
  initialMarking: { idle: 1, ready: 0 },
  transitions: [
    { name: "start", type: "auto", inputs: ["idle"], outputs: ["ready"] },
    { name: "execShell", type: "auto", inputs: ["ready"], outputs: ["ready"], tools: ["bash"] },
  ],
});

// Register as an OpenClaw plugin
export default createPetriGatePlugin([toolApproval]);
```

### Registry mode (dynamic nets)

```ts
import { createPetriGatePlugin } from "@petriflow/openclaw";
import { toolApproval } from "./nets/tool-approval.js";
import { deployNet } from "./nets/deploy.js";

export default createPetriGatePlugin({
  registry: { "tool-approval": toolApproval, deploy: deployNet },
  active: ["tool-approval"],
});
```

With registry mode, users get `/add-net` and `/remove-net` commands to activate and deactivate nets at runtime.

## Hook mapping

| Gate concept | OpenClaw hook | Behavior |
|---|---|---|
| `handleToolCall` | `before_tool_call` | Returns `{ block, blockReason }` for disallowed tools |
| `handleToolResult` | `after_tool_call` | Resolves deferred transitions on tool completion |
| System prompt injection | `before_agent_start` | Returns `{ prependContext }` with active net status |

## Commands

| Command | Description |
|---|---|
| `/net-status` | Show current Petri net state and markings |
| `/add-net <name>` | Activate a net from the registry (registry mode only) |
| `/remove-net <name>` | Deactivate a net, state preserved (registry mode only) |

## Design notes

**No `toolCallId` in hooks.** OpenClaw's `before_tool_call` and `after_tool_call` don't expose `toolCallId`. The plugin generates synthetic IDs and correlates them via FIFO queues per tool name. This is correct for sequential tool execution (OpenClaw's typical mode). Parallel calls to the *same* tool name with mixed success/failure could theoretically mismatch — extremely rare in practice.

**`hasUI: false`.** OpenClaw has no interactive confirm during hook execution. Nets with `manual` transitions will auto-deny. Design nets with structural/semantic checks (not manual gates) for OpenClaw use.

**`prependContext` not `systemPrompt`.** The plugin prepends net status as additional context, preserving the existing system prompt.

## Tests

```bash
bun test packages/openclaw
```
