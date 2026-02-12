---
name: deploy
description: Deploy code through a safe pipeline. Tests must pass before staging, staging must succeed before production, and production requires human sign-off.
---

# Deploy

Run the full deployment pipeline with structural safety guarantees. You have full autonomy for testing, building, and staging — production is the only step that needs human approval.

## Pipeline

1. **Test** — run your test suite (`bun test`, `npm test`, `pytest`, etc.)
2. **Build** — compile/bundle the project
3. **Deploy to staging** — push to staging/preview environment (blocked until tests pass)
4. **Deploy to production** — push to production (requires human approval)

## What's free (no restrictions)

- Running tests (any number of times)
- Building the project
- Reading logs, checking status
- Running any other bash commands
- **Rollback** — always available, no restrictions

## What's gated

- **Deploy to staging** — blocked until a test run succeeds. You can build, debug, and iterate freely, but you cannot push to staging without green tests.
- **Deploy to production** — requires human approval. This is the only manual gate in the entire pipeline.

## Tips

- Run tests early and often — they're free
- If staging deploy fails, you stay in the ready state and can retry after fixing
- After a successful staging deploy, test tracking resets — you need fresh passing tests for the next staging cycle
- Rollback is always free — if something goes wrong, roll back immediately
