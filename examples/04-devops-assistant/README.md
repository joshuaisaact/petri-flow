# Example 4: DevOps Assistant

Demonstrates cross-domain composition — one agent, 13 tools, 5 domains, 10 rules. Each domain's rules are independently enforced without interference.

## Rules

```
# Slack
require slack.readMessages before slack.sendMessage
limit slack.sendMessage to 10 per session

# Email
require human-approval before sendEmail
limit sendEmail to 3 per session

# Deployment pipeline
require lint before test
require test before deploy
require human-approval before deploy
limit deploy to 2 per session

# File safety
require backup before delete
block rm
```

- **Slack** — must read channel context before sending, capped at 10 messages
- **Email** — every send requires human approval, capped at 3
- **Deployment** — full `lint → test → deploy` pipeline with approval gate, max 2 deploys
- **Files** — backup before delete, `rm` permanently blocked
- **Research** — `webSearch` is free (no rules mention it)

## What happens

1. `webSearch` — works immediately (free tool, no rules)
2. `readInbox` — works immediately (free tool)
3. `slack.sendMessage` — blocked (readMessages required first)
4. `slack.readMessages` — succeeds, unlocks sendMessage
5. `slack.sendMessage` — allowed (1/10 budget used)
6. `deploy` — blocked (lint and test required first)
7. `lint → test` — pipeline completes
8. Human approves deploy — deploy succeeds (1/2 budget)
9. Human approves sendEmail — email sent (1/3 budget)
10. `backup temp.log` — succeeds, unlocks delete
11. `delete temp.log` — allowed
12. `rm` — permanently blocked

## Run

```bash
ANTHROPIC_API_KEY=sk-... bun run examples/04-devops-assistant/agent.ts
```

## Full tutorial

[Step-by-step walkthrough on petriflow.joshtuddenham.dev](https://petriflow.joshtuddenham.dev/docs/tutorial-devops-assistant/)
