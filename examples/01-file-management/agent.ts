import { generateText, tool, stepCountIs } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import { loadRules } from "@petriflow/rules";
import { createPetriflowGate } from "@petriflow/vercel-ai";
import { files } from "./tools";

// Load rules from file
const { nets, verification } = await loadRules(
  new URL("./safety.rules", import.meta.url).pathname,
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

// Define tools — listFiles and readFile are free (no rules mention them).
// backup is deferred (must succeed before delete is allowed).
// delete is gated (requires backup first).
// rm is permanently blocked.
const tools = gate.wrapTools({
  listFiles: tool({
    description: "List files in a directory",
    inputSchema: z.object({ path: z.string() }),
    execute: async ({ path }) => files.list(path),
  }),
  readFile: tool({
    description: "Read a file's contents",
    inputSchema: z.object({ path: z.string() }),
    execute: async ({ path }) => files.read(path),
  }),
  backup: tool({
    description: "Create a backup of a file before modifying it",
    inputSchema: z.object({ path: z.string() }),
    execute: async ({ path }) => files.backup(path),
  }),
  delete: tool({
    description: "Delete a file (requires backup first)",
    inputSchema: z.object({ path: z.string() }),
    execute: async ({ path }) => files.remove(path),
  }),
  rm: tool({
    description: "Remove a file with force",
    inputSchema: z.object({ path: z.string() }),
    execute: async ({ path }) => files.forceRemove(path),
  }),
});

const result = await generateText({
  model: anthropic("claude-sonnet-4-5-20250929"),
  system: `You are a file management agent that helps clean up directories.\n\n${gate.systemPrompt()}`,
  tools,
  stopWhen: stepCountIs(10),
  prompt:
    "Clean up /tmp/project: list the files, delete temp.log, and rm old-backup.tar.gz",
});

console.log("\n--- Final Response ---");
console.log(result.text);
