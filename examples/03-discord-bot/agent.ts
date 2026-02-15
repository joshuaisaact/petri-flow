import { generateText, tool } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import { loadRules } from "@petriflow/rules";
import { createPetriflowGate } from "@petriflow/vercel-ai";

// Load rules from file
const { nets, verification } = loadRules(
  new URL("./messaging.rules", import.meta.url).pathname,
);
console.log("Loaded rules:", verification);

// Create the gate
const gate = createPetriflowGate(nets, {
  onDecision: (event, decision) => {
    if (decision?.block) {
      console.log(`BLOCKED ${event.toolName}: ${decision.reason}`);
    }
  },
});

// Single "discord" tool with an action enum.
// Rules use dot notation (discord.readMessages, discord.sendMessage) which
// auto-generates a toolMapper that resolves the virtual tool name from
// the action field in the input.
const tools = gate.wrapTools({
  discord: tool({
    description:
      "Interact with Discord: read messages, send messages, add reactions, or create threads",
    parameters: z.object({
      action: z.enum([
        "readMessages",
        "sendMessage",
        "addReaction",
        "createThread",
      ]),
      channel: z.string().describe("Channel name"),
      content: z.string().optional().describe("Message content (for sendMessage)"),
      messageId: z
        .string()
        .optional()
        .describe("Target message ID (for addReaction)"),
      emoji: z.string().optional().describe("Emoji to react with"),
      threadName: z
        .string()
        .optional()
        .describe("Thread name (for createThread)"),
    }),
    execute: async (input) => {
      console.log(`> discord.${input.action} #${input.channel}`);
      switch (input.action) {
        case "readMessages":
          return {
            messages: [
              { author: "alice", content: "Build failed on main" },
              { author: "bob", content: "Looking into it now" },
              { author: "carol", content: "Might be the new dependency" },
            ],
          };
        case "sendMessage":
          return { sent: true, id: `msg-${Date.now()}` };
        case "addReaction":
          return { reacted: true, messageId: input.messageId, emoji: input.emoji };
        case "createThread":
          return { created: true, threadName: input.threadName };
      }
    },
  }),
});

const result = await generateText({
  model: anthropic("claude-sonnet-4-5-20250929"),
  system: `You are a Discord bot agent that manages channel communications.\n\n${gate.systemPrompt()}`,
  tools,
  maxSteps: 15,
  prompt:
    "In channel dev-general: send a greeting, read messages, reply about the build failure, and send a few follow-up messages.",
});

console.log("\n--- Final Response ---");
console.log(result.text);
