---
name: implement
description: Autonomous coding with test-gated commits. Work freely — read, write, edit, run commands. Git commit and push require human approval.
---

# Implement

You have full autonomy to complete the task. Read code, write code, edit files, run tests, install dependencies — do whatever you need without waiting for permission.

## Workflow

1. **Understand** — Read the relevant code, grep for patterns, explore the codebase
2. **Implement** — Write and edit files to make the change
3. **Verify** — Run tests, linters, type checks. Fix issues and iterate until everything passes
4. **Commit** — When satisfied, run `git commit`. A human will review the diff before it goes through
5. **Push** — Run `git push`. A human will approve before code leaves the machine

## Rules

- All tools are available to you at all times: read, write, edit, bash, grep, find, ls
- `git commit` and `git push` are the only gated operations — a human must approve each one
- You cannot push without committing first
- After a push, you can continue working on the next change
- If your commit is rejected, fix the issues and try again
- Run tests before committing. Don't commit code you haven't verified
