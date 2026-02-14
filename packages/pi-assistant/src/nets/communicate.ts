import type { Marking } from "@petriflow/engine";
import { defineSkillNet } from "@petriflow/gate";
import type { ToolEvent } from "@petriflow/gate";

// -----------------------------------------------------------------------
// Channel extraction
// -----------------------------------------------------------------------

/** Extract channel/conversation target from a slack tool event */
export function extractChannel(input: Record<string, unknown>): string | null {
  // readMessages: { action: "readMessages", channelId: "C123" }
  if (typeof input.channelId === "string") return input.channelId;
  // sendMessage: { action: "sendMessage", to: "channel:C123" } or { to: "user:U123" }
  if (typeof input.to === "string") return input.to;
  return null;
}

// -----------------------------------------------------------------------
// Tool mapping
// -----------------------------------------------------------------------

/**
 * Map slack actions to virtual tool names:
 *  - readMessages → "observe"   (gated, produces send token)
 *  - sendMessage  → "send"      (gated, consumes send token)
 *  - react, pin/unpin, listPins, memberInfo, emojiList → free
 *  - editMessage  → free        (editing own messages is low-risk)
 *  - deleteMessage → free       (deleting own messages is low-risk)
 */
function mapTool(event: ToolEvent): string {
  if (event.toolName !== "slack") return event.toolName;

  const action = (event.input as { action?: string }).action ?? "";

  switch (action) {
    case "readMessages":
      return "observe";
    case "sendMessage":
      return "send";
    // All other slack actions are low-risk — free
    case "react":
    case "reactions":
    case "editMessage":
    case "deleteMessage":
    case "pinMessage":
    case "unpinMessage":
    case "listPins":
    case "memberInfo":
    case "emojiList":
      return action;
    default:
      return event.toolName;
  }
}

// -----------------------------------------------------------------------
// Net definition
// -----------------------------------------------------------------------

const places = ["idle", "ready", "canSend"] as const;
type Place = (typeof places)[number];

const initialMarking: Marking<Place> = {
  idle: 1,
  ready: 0,
  canSend: 0,
};

type ObservedEntry = { channel: string };

/**
 * Communicate skill net — observe-before-send for messaging.
 *
 * Safety property: The agent cannot send a message to a channel/DM
 * without first reading messages in that same channel. Each read
 * enables exactly one send to that channel, then the agent must
 * read again. This prevents:
 *   - Blind messaging without context
 *   - Sending to the wrong channel
 *   - Spam (read:send is 1:1)
 *
 * Flow:
 *   idle → ready (auto-advance)
 *   ready → [observe, deferred] → canSend
 *   canSend → [send] → ready
 *
 * All other slack actions (react, pin, edit, delete) are free.
 * Non-slack tools (read, bash, ls, etc.) are free.
 */
export const communicateNet = defineSkillNet<Place>({
  name: "communicate",
  places: [...places],
  terminalPlaces: [],
  freeTools: [
    // Non-slack tools
    "read", "write", "edit", "bash", "ls", "grep", "find",
    // Low-risk slack actions
    "react", "reactions", "editMessage", "deleteMessage",
    "pinMessage", "unpinMessage", "listPins", "memberInfo", "emojiList",
  ],
  initialMarking,
  toolMapper: mapTool,

  transitions: [
    {
      name: "start",
      type: "auto",
      inputs: ["idle"],
      outputs: ["ready"],
    },
    {
      name: "observe",
      type: "auto",
      inputs: ["ready"],
      outputs: ["canSend"],
      tools: ["observe"],
      deferred: true,
    },
    {
      name: "send",
      type: "auto",
      inputs: ["canSend"],
      outputs: ["ready"],
      tools: ["send"],
    },
  ],

  // After a successful read, record which channel was observed
  onDeferredResult(event, _resolvedTool, _transition, state) {
    const channel = extractChannel(event.input);
    if (channel) {
      const entries = (state.meta.observedChannels as ObservedEntry[] | undefined) ?? [];
      entries.push({ channel });
      state.meta.observedChannels = entries;
    }
  },

  // Before allowing a send, check that the target channel was observed
  validateToolCall(event, resolvedTool, _transition, state) {
    if (resolvedTool !== "send") return;

    const channel = extractChannel(event.input);
    if (!channel) return;

    const entries = (state.meta.observedChannels as ObservedEntry[] | undefined) ?? [];
    const idx = entries.findIndex((e) => e.channel === channel);

    if (idx < 0) {
      return {
        block: true,
        reason: `Must read messages in '${channel}' before sending. Observed: [${entries.map((e) => e.channel).join(", ") || "nothing"}]`,
      };
    }

    // Consume the observation (1:1 read:send)
    entries.splice(idx, 1);
  },
});
