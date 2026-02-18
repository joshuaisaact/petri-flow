import { generateText, tool, stepCountIs } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import { createInterface } from "readline";
import { loadRules } from "@petriflow/rules";
import { createPetriflowGate } from "@petriflow/vercel-ai";
import { web, slack, email, pipeline, files } from "./tools";

// Interactive terminal prompt — blocks until the user types y/n
async function askApproval(title: string, message: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(`\n--- APPROVAL REQUIRED ---\n${title}\n${message}\nApprove? (y/n) `, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === "y");
    });
  });
}

// Load rules from file
const { nets, verification } = await loadRules(
  new URL("./assistant.rules", import.meta.url).pathname,
);
console.log("Loaded rules:", verification);

// Create the gate — deploy and sendEmail will pause for real human approval
const gate = createPetriflowGate(nets, {
  confirm: askApproval,
  onDecision: (event, decision) => {
    if (decision?.block) {
      console.log(`BLOCKED ${event.toolName}: ${decision.reason}`);
    }
  },
});

// Define tools across 5 domains:
// - Research: webSearch (free)
// - Slack: slack with readMessages/sendMessage actions (dot notation)
// - Email: readInbox (free), sendEmail (gated)
// - Deployment: lint, test, deploy, checkStatus (free)
// - Files: listFiles (free), readFile (free), backup, delete, rm (blocked)
const tools = gate.wrapTools({
  // --- Research ---
  webSearch: tool({
    description: "Search the web for information",
    inputSchema: z.object({ query: z.string() }),
    execute: async ({ query }) => web.search(query),
  }),

  // --- Slack (dot notation: slack.readMessages, slack.sendMessage) ---
  slack: tool({
    description: "Interact with Slack: read messages or send a message",
    inputSchema: z.object({
      action: z.enum(["readMessages", "sendMessage"]),
      channel: z.string().describe("Channel name"),
      content: z.string().optional().describe("Message content (for sendMessage)"),
    }),
    execute: async (input) => {
      switch (input.action) {
        case "readMessages":
          return slack.readMessages(input.channel);
        case "sendMessage":
          return slack.sendMessage(input.channel, input.content!);
      }
    },
  }),

  // --- Email ---
  readInbox: tool({
    description: "Read email inbox for recent messages",
    inputSchema: z.object({}),
    execute: async () => email.readInbox(),
  }),
  sendEmail: tool({
    description: "Send an email (requires human approval)",
    inputSchema: z.object({
      to: z.string(),
      subject: z.string(),
      body: z.string(),
    }),
    execute: async ({ to, subject, body }) => email.send(to, subject, body),
  }),

  // --- Deployment ---
  lint: tool({
    description: "Run the linter on the codebase",
    inputSchema: z.object({}),
    execute: async () => pipeline.lint(),
  }),
  test: tool({
    description: "Run the test suite",
    inputSchema: z.object({}),
    execute: async () => pipeline.test(),
  }),
  deploy: tool({
    description: "Deploy to an environment (requires lint, test, and human approval)",
    inputSchema: z.object({
      environment: z.enum(["production", "staging"]),
    }),
    execute: async ({ environment }) => pipeline.deploy(environment),
  }),
  checkStatus: tool({
    description: "Check the current deployment status",
    inputSchema: z.object({
      environment: z.enum(["production", "staging"]),
    }),
    execute: async ({ environment }) => pipeline.checkStatus(environment),
  }),

  // --- Files ---
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
  system: `You are a DevOps assistant that manages deployments, communications, and file cleanup.\n\n${gate.systemPrompt()}`,
  tools,
  stopWhen: stepCountIs(20),
  prompt:
    "Check my inbox for dependency update notifications, research the latest Node.js 22 release, let the team know on Slack what you find, run the deployment pipeline for production, email my manager a status update when it's done, and clean up temp files in /tmp/project.",
});

console.log("\n--- Final Response ---");
console.log(result.text);
