# Example 1: File Management Agent

Demonstrates `require ... before ...` (sequencing) and `block` (permanent deny) rules.

## Rules

```
require backup before delete
block rm
```

- **backup** must succeed before **delete** is allowed
- **rm** is permanently blocked — the model must explain it can't use it
- **listFiles** and **readFile** are free (no rules mention them)

## What happens

1. Model calls `listFiles` — works immediately (free tool)
2. Model tries `delete temp.log` — blocked ("backup required first")
3. Model calls `backup temp.log` — succeeds, net advances
4. Model retries `delete temp.log` — now allowed
5. Model tries `rm old-backup.tar.gz` — permanently blocked
6. Model explains it cannot use `rm`

## Run

```bash
ANTHROPIC_API_KEY=sk-... bun run examples/01-file-management/agent.ts
```
