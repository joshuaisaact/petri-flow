# @petriflow/vercel-ai

Petri net gating adapter for the [Vercel AI SDK](https://sdk.vercel.ai/) (v6+). Wraps tool definitions so each `execute` call is gated by `@petriflow/gate`.

## Install

```bash
bun add @petriflow/vercel-ai
# or
npm install @petriflow/vercel-ai
```

Peer dependency: `ai` ^6.0.0

## Usage

```ts
import { loadRules } from '@petriflow/rules';
import { createPetriflowGate } from '@petriflow/vercel-ai';
import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai';

const { nets } = loadRules('./safety.rules');
const gate = createPetriflowGate(nets);

const result = await generateText({
  model: openai('gpt-4o'),
  tools: gate.wrapTools({ weather: weatherTool, bash: bashTool }),
  system: gate.systemPrompt(),
  prompt: 'What is the weather?',
});
```

### With `streamText`

```ts
import { streamText } from 'ai';

const result = streamText({
  model: openai('gpt-4o'),
  tools: gate.wrapTools(myTools),
  system: gate.systemPrompt(),
  prompt: '...',
});
```

### Manual confirmation

```ts
const gate = createPetriflowGate(nets, {
  confirm: async (title, msg) => {
    // Show a dialog, return true/false
    return showConfirmDialog(title, msg);
  },
});
```

### Registry mode (dynamic nets)

```ts
const gate = createPetriflowGate({
  registry: { safety: safetyNet, deploy: deployNet },
  active: ['safety'],
});

gate.addNet('deploy');    // activate a registered net
gate.removeNet('safety'); // deactivate (state preserved)
```

### Shadow mode

```ts
const gate = createPetriflowGate(nets, {
  mode: 'shadow',
  onDecision: (event, decision) => {
    console.log('Would have blocked:', event.toolName, decision);
  },
});
```

## API

| Method | Description |
|--------|-------------|
| `createPetriflowGate(nets, opts?)` | Create a gate instance from nets or a registry config |
| `gate.wrapTools(tools)` | Wrap tool definitions with gate logic |
| `gate.systemPrompt()` | Get system prompt with net status |
| `gate.formatStatus()` | Get current marking for all nets |
| `gate.addNet(name)` | Activate a registered net (registry mode) |
| `gate.removeNet(name)` | Deactivate a net (registry mode) |
| `gate.manager` | Access the underlying `GateManager` |

## Bundled net

```ts
import { vercelAiToolApprovalNet } from '@petriflow/vercel-ai/nets/tool-approval';
```

A generic tool-approval net with `readData`/`fetchData` as free tools and `writeData`/`sendEmail` as gated tools.

## How it works

```
User's tools ──→ gate.wrapTools() ──→ Gated tools ──→ generateText/streamText
                      │
                      ▼
              Each tool.execute is replaced:
              1. manager.handleToolCall()  → block or allow
              2. original execute()        → run the tool
              3. manager.handleToolResult() → resolve deferreds
```

Blocked tools throw `ToolCallBlockedError`, which the SDK reports as `tool-error` to the model.
