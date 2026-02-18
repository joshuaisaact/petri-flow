import { generateText, tool, stepCountIs } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import { createInterface } from "readline";
import { loadRules } from "@petriflow/rules";
import { createPetriflowGate } from "@petriflow/vercel-ai";

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
    execute: async ({ query }) => {
      console.log(`> webSearch "${query}"`);
      return {
        results: [
          { title: "Node.js 22 LTS Released", snippet: "Node.js 22 is now the active LTS release with stable fetch, WebSocket, and test runner." },
          { title: "Breaking changes in Node.js 22", snippet: "V8 engine updated to 12.4, ESM loading changes, new permission model." },
        ],
      };
    },
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
      console.log(`> slack.${input.action} #${input.channel}`);
      switch (input.action) {
        case "readMessages":
          return {
            messages: [
              { author: "alice", content: "Dependency update PR merged" },
              { author: "bob", content: "Tests passing on staging" },
            ],
          };
        case "sendMessage":
          return { sent: true, channel: input.channel };
      }
    },
  }),

  // --- Email ---
  readInbox: tool({
    description: "Read email inbox for recent messages",
    inputSchema: z.object({}),
    execute: async () => {
      console.log("> readInbox");
      return {
        emails: [
          { from: "dependabot@github.com", subject: "Bump node from 20 to 22", date: "2024-01-15" },
          { from: "ci@company.com", subject: "Nightly build passed", date: "2024-01-15" },
        ],
      };
    },
  }),
  sendEmail: tool({
    description: "Send an email (requires human approval)",
    inputSchema: z.object({
      to: z.string(),
      subject: z.string(),
      body: z.string(),
    }),
    execute: async ({ to, subject }) => {
      console.log(`> sendEmail to=${to} subject="${subject}"`);
      return { sent: true };
    },
  }),

  // --- Deployment ---
  lint: tool({
    description: "Run the linter on the codebase",
    inputSchema: z.object({}),
    execute: async () => {
      console.log("> lint");
      return { passed: true, warnings: 0, errors: 0 };
    },
  }),
  test: tool({
    description: "Run the test suite",
    inputSchema: z.object({}),
    execute: async () => {
      console.log("> test");
      return { passed: true, total: 42, failed: 0 };
    },
  }),
  deploy: tool({
    description: "Deploy to an environment (requires lint, test, and human approval)",
    inputSchema: z.object({
      environment: z.enum(["production", "staging"]),
    }),
    execute: async ({ environment }) => {
      console.log(`> deploy ${environment}`);
      return { deployed: true, environment, version: "2.1.0" };
    },
  }),
  checkStatus: tool({
    description: "Check the current deployment status",
    inputSchema: z.object({
      environment: z.enum(["production", "staging"]),
    }),
    execute: async ({ environment }) => {
      console.log(`> checkStatus ${environment}`);
      return { environment, status: "healthy", version: "2.0.9" };
    },
  }),

  // --- Files ---
  listFiles: tool({
    description: "List files in a directory",
    inputSchema: z.object({ path: z.string() }),
    execute: async ({ path }) => {
      console.log(`> listFiles ${path}`);
      return { files: ["temp.log", "cache.json", "build-output.tar.gz", "config.yaml"] };
    },
  }),
  readFile: tool({
    description: "Read a file's contents",
    inputSchema: z.object({ path: z.string() }),
    execute: async ({ path }) => {
      console.log(`> readFile ${path}`);
      return { content: `Contents of ${path}` };
    },
  }),
  backup: tool({
    description: "Create a backup of a file before modifying it",
    inputSchema: z.object({ path: z.string() }),
    execute: async ({ path }) => {
      console.log(`> backup ${path}`);
      return { backedUp: `${path}.bak` };
    },
  }),
  delete: tool({
    description: "Delete a file (requires backup first)",
    inputSchema: z.object({ path: z.string() }),
    execute: async ({ path }) => {
      console.log(`> delete ${path}`);
      return { deleted: path };
    },
  }),
  rm: tool({
    description: "Remove a file with force",
    inputSchema: z.object({ path: z.string() }),
    execute: async ({ path }) => {
      console.log(`> rm ${path}`);
      return { removed: path };
    },
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
