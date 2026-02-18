# Example 3: Discord Bot Agent

Demonstrates dot notation for action-dispatch tools and session rate limits.

## Rules

```
require discord.readMessages before discord.sendMessage
limit discord.sendMessage to 5 per session
```

- `discord.readMessages` must succeed before `discord.sendMessage` is allowed
- `discord.sendMessage` is limited to 5 calls per session
- `discord.addReaction` and `discord.createThread` are ungated (no rules mention them)

## How dot notation works

A single `discord` tool has an `action` parameter with values like `readMessages`, `sendMessage`, etc. The rules compiler sees `discord.readMessages` and auto-generates a `toolMapper` that resolves the virtual tool name from `input.action`.

## What happens

The sequencing rule cycles — after each `sendMessage`, the model must call `readMessages` again before the next send. This naturally interleaves reading context with sending replies.

1. Model tries `discord.sendMessage` — blocked (readMessages required first)
2. Model calls `discord.readMessages` — succeeds, net advances
3. Model sends greeting — works (1/5 budget used)
4. Model must `readMessages` again before next send (rule cycles)
5. Model reads, then sends reply about build failure — works (2/5)
6. Pattern repeats for follow-ups — each send consumes budget
7. After 5 sends, rate limit kicks in permanently
8. `addReaction` and `createThread` remain available throughout

## Run

```bash
ANTHROPIC_API_KEY=sk-... bun run examples/03-discord-bot/agent.ts
```

## Full tutorial

[Step-by-step walkthrough on petriflow.joshtuddenham.dev](https://petriflow.joshtuddenham.dev/docs/tutorial-discord-bot/)
