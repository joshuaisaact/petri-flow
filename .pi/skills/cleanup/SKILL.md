---
name: cleanup
description: Safe destructive cleanup. Delete files, reset git state, drop databases — the system guarantees a backup exists before any destructive command runs.
---

# Cleanup

Clean up aggressively. Wipe build artifacts, reset git state, clear caches, drop test databases, remove generated files. You have full autonomy — no approval dialogs.

## Safety guarantee

The system structurally enforces: **every destructive command must be preceded by a successful backup that covers the same path.** This isn't a suggestion — destructive commands are physically blocked until the backup exists.

- `rm -rf build/` requires a prior `cp -r build/ /tmp/build-backup` or equivalent
- `git reset --hard` requires a prior `git stash`
- `DROP TABLE` requires a prior `pg_dump`

If your backup command fails (non-zero exit), it doesn't count. You must retry.

## Workflow

1. **Survey** — Read files, check what needs cleaning (read, ls, grep are free)
2. **Backup** — Run a backup command targeting what you'll destroy
3. **Destroy** — Now the destructive command is unlocked
4. **Repeat** — Each destructive command consumes its backup. Back up again before the next one

## Backup commands

Any of these produce a backup token:
- `git stash` — covers the entire worktree
- `cp -r <src> <dest>` — covers `<src>`
- `tar czf <archive> <src>` — covers `<src>`
- `pg_dump` / `mysqldump` — covers the database
- `rsync <src> <dest>` — covers `<src>`

## Destructive commands

These require a covering backup:
- `rm` (any flags)
- `git reset --hard`
- `git clean`
- `git checkout .`
- `DROP TABLE` / `DROP DATABASE` / `TRUNCATE`

## Tips

- Use `git stash` as a universal backup — it covers everything in the worktree
- For targeted cleanup, back up just what you need: `cp -r dist/ /tmp/dist-bak`
- Regular bash commands (build, test, install) are always free
- Read/write/edit are always free — only destructive bash is gated
