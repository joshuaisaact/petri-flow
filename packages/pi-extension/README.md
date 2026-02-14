# @petriflow/pi-extension

Petri net gating for [pi-mono](https://github.com/nicholasgasior/pi-mono) agent tools. Intercepts `tool_call` and `tool_result` events via pi-mono's extension API and enforces workflow structure through [`@petriflow/gate`](../gate).

## Why

LLM agents can call any tool at any time. That's fine for read-only exploration, but dangerous for destructive or irreversible actions. This package lets you define safety constraints as Petri nets — the agent can only use a tool if an enabled transition allows it. No enabled transition = tool blocked.

## Usage

### Single net

```ts
import { createPetriGate } from "@petriflow/pi-extension";
import { toolApprovalNet } from "@petriflow/pi-extension/nets/tool-approval";

const extension = createPetriGate(toolApprovalNet);
// Pass to pi-mono as an extension
```

### Composed nets

```ts
import { composeGates } from "@petriflow/pi-extension";
import { implementNet } from "./nets/implement.js";
import { nukeNet } from "./nets/nuke.js";

const extension = composeGates([implementNet, nukeNet]);
```

### Registry mode (dynamic nets)

```ts
import { composeGates } from "@petriflow/pi-extension";

const extension = composeGates({
  registry: { implement: implementNet, nuke: nukeNet },
  active: ["implement"],
});
```

With registry mode, users get `/add-net` and `/remove-net` commands to activate and deactivate nets at runtime.

## Hook mapping

| Gate concept | pi-mono event | Behavior |
|---|---|---|
| `handleToolCall` | `tool_call` | 4-phase protocol: structural check → manual approval → semantic validation → commit |
| `handleToolResult` | `tool_result` | Resolves deferred transitions, fans out to all nets |
| System prompt | `before_agent_start` | Appends active net status to the system prompt |

## Commands

| Command | Description |
|---|---|
| `/net-status` | Show current Petri net state and markings |
| `/add-net <name>` | Activate a net from the registry (registry mode only) |
| `/remove-net <name>` | Deactivate a net, state preserved (registry mode only) |

## Included nets

### tool-approval

Simple per-call human approval. Observational tools (`ls`, `read`, `grep`, `find`) are free. Mutating tools (`bash`, `write`, `edit`) require confirmation via the UI.

```
idle → ready (auto) → ready (manual, per tool call)
```

### implement

Autonomous coding with gated commits. All standard tools are free — the agent reads, writes, edits, runs tests without friction. Only irreversible git operations are gated:

- `git commit` / `git merge` → human reviews the diff
- `git push` → human approves before code leaves the machine

Uses **tool mapping** to split `bash` into virtual tools (`git-commit`, `git-push`) based on command content.

```
idle → working ←→ committed
        (commit)↗   ↘(push)
```

### nuke

Destructive operations with guaranteed backup. All tools are free except destructive bash commands (`rm -rf`, `git reset --hard`, `DROP TABLE`, etc.), which require a successful backup first.

Uses **deferred transitions** (backup only fires when the command succeeds), **tool mapping** (classifies bash commands as `backup`, `destructive`, or plain `bash`), and **semantic validation** (checks path coverage — backing up `src/` doesn't unlock deleting `build/`).

```
idle → ready → [backup, deferred] → backedUp → [destroy] → ready
```

## Tests

```bash
bun test packages/pi-extension
```
