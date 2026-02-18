import { generateText, tool, stepCountIs } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import { loadRules } from "@petriflow/rules";
import { createPetriflowGate } from "@petriflow/vercel-ai";
import { discord } from "./tools";

// Load rules from file
const { nets, verification } = await loadRules(
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
    inputSchema: z.object({
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
      switch (input.action) {
        case "readMessages":
          return discord.readMessages(input.channel);
        case "sendMessage":
          return discord.sendMessage(input.channel, input.content!);
        case "addReaction":
          return discord.addReaction(input.channel, input.messageId!, input.emoji!);
        case "createThread":
          return discord.createThread(input.channel, input.threadName!);
      }
    },
  }),
});

const result = await generateText({
  model: anthropic("claude-sonnet-4-5-20250929"),
  system: `You are a Discord bot agent that manages channel communications.\n\n${gate.systemPrompt()}`,
  tools,
  stopWhen: stepCountIs(15),
  prompt:
    "In channel dev-general: send a greeting, read messages, reply about the build failure, and send a few follow-up messages.",
});

console.log("\n--- Final Response ---");
console.log(result.text);
