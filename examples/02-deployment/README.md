# Example 2: Deployment Agent

Demonstrates chained sequencing, human-approval gates, and session rate limits.

## Rules

```
require lint before test
require test before deploy
require human-approval before deploy
limit deploy to 2 per session
```

- **lint** must pass before **test** is allowed
- **test** must pass before **deploy** is allowed
- **deploy** requires human approval every time (auto-approved in this demo)
- **deploy** can only be called 2 times per session
- **checkStatus** and **rollback** are free (no rules mention them)

## What happens

1. Model tries `deploy production` — blocked (test required)
2. Model tries `test` — blocked (lint required)
3. Model calls `lint` — succeeds
4. Model calls `test` — now allowed, succeeds
5. Approval prompt fires for `deploy` — auto-approved
6. Model calls `deploy production` — succeeds (1/2 budget used)
7. Model repeats lint/test/approve cycle for staging deploy (2/2 budget used)
8. A third deploy would hit the rate limit

## Run

```bash
ANTHROPIC_API_KEY=sk-... bun run examples/02-deployment/agent.ts
```
