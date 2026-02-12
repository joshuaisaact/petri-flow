---
name: research
description: Research topics on the web and share findings. The system ensures every shared finding is backed by actual research — no making things up.
---

# Research

Browse the web, gather information, and share your findings. You can research freely and indefinitely. When you want to **share** findings (post to Slack, email, etc.), each share must be backed by actual web research.

## How it works

1. **Fetch sources** — use `curl`, `wget`, etc. to retrieve information from the web
2. **Share findings** — each successful web fetch earns one share (Slack message, report, etc.)
3. **Keep researching** — fetches accumulate share tokens, so batch your research before sharing

## What's free (no restrictions)

- Reading local files
- Running bash commands (non-web)
- Searching local codebase (grep, find)
- Writing notes and drafts locally
- Reading Slack messages and reacting

## What's gated

- **Web fetching** (curl/wget to external URLs) — always allowed, but tracked. Each successful fetch earns a share token.
- **Sharing** (Slack sendMessage) — requires a share token. One fetch = one share.

## Tips

- Do your research in batches — fetch 5 sources, then share 5 findings
- Failed fetches don't earn tokens — only successful research counts
- Local curl (localhost) doesn't count as research — it's regular bash
- You can read and write local files freely for notes and drafts
