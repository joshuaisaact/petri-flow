---
name: communicate
description: Send messages in Slack channels and DMs. The system ensures you always read the conversation before sending — no blind messaging, no wrong-channel mistakes.
---

# Communicate

You can read messages, react, pin, edit your own messages, and manage emoji freely. When you need to **send a new message**, you must first read the channel or DM thread you're sending to.

## How it works

1. **Read the conversation** — use `readMessages` for the target channel/DM
2. **Send your message** — now you can `sendMessage` to that channel
3. **Repeat** — each send requires a fresh read (keeps you in context)

## What's free (no restrictions)

- Reading messages in any channel
- Reacting to messages (emoji)
- Editing your own messages
- Deleting your own messages
- Pinning/unpinning messages
- Listing pins, member info, emoji list
- All non-Slack tools (read files, run commands, etc.)

## What's gated

- **Sending new messages** — requires reading the target channel first. You can't send to a channel you haven't read. This prevents wrong-channel mistakes and ensures you have conversational context.

## Tips

- Reading is fast — just do it before each send
- If you need to message multiple channels, read each one first
- Reactions are always free — use them liberally for acknowledgments
- Editing your own messages is free — fix typos without re-reading
