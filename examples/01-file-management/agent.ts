import { generateText, tool } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import { loadRules } from "@petriflow/rules";
import { createPetriflowGate } from "@petriflow/vercel-ai";

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
    parameters: z.object({ path: z.string() }),
    execute: async ({ path }) => {
      console.log(`> listFiles ${path}`);
      return {
        files: ["temp.log", "old-backup.tar.gz", "important.txt", "config.json"],
      };
    },
  }),
  readFile: tool({
    description: "Read a file's contents",
    parameters: z.object({ path: z.string() }),
    execute: async ({ path }) => {
      console.log(`> readFile ${path}`);
      return { content: `Contents of ${path}` };
    },
  }),
  backup: tool({
    description: "Create a backup of a file before modifying it",
    parameters: z.object({ path: z.string() }),
    execute: async ({ path }) => {
      console.log(`> backup ${path}`);
      return { backedUp: `${path}.bak` };
    },
  }),
  delete: tool({
    description: "Delete a file (requires backup first)",
    parameters: z.object({ path: z.string() }),
    execute: async ({ path }) => {
      console.log(`> delete ${path}`);
      return { deleted: path };
    },
  }),
  rm: tool({
    description: "Remove a file with force",
    parameters: z.object({ path: z.string() }),
    execute: async ({ path }) => {
      console.log(`> rm ${path}`);
      return { removed: path };
    },
  }),
});

const result = await generateText({
  model: anthropic("claude-sonnet-4-5-20250929"),
  system: `You are a file management agent that helps clean up directories.\n\n${gate.systemPrompt()}`,
  tools,
  maxSteps: 10,
  prompt:
    "Clean up /tmp/project: list the files, delete temp.log, and rm old-backup.tar.gz",
});

console.log("\n--- Final Response ---");
console.log(result.text);
