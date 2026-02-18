import { generateText, tool, stepCountIs } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import { loadRules } from "@petriflow/rules";
import { createPetriflowGate } from "@petriflow/vercel-ai";
import { pipeline } from "./tools";

// Load rules from file
const { nets, verification } = await loadRules(
  new URL("./pipeline.rules", import.meta.url).pathname,
);
console.log("Loaded rules:", verification);

// Create the gate with auto-approve for human-approval transitions
const gate = createPetriflowGate(nets, {
  confirm: async (title, message) => {
    console.log(`APPROVAL REQUESTED: ${title} — ${message}`);
    console.log("Auto-approving for demo...");
    return true;
  },
  onDecision: (event, decision) => {
    if (decision?.block) {
      console.log(`BLOCKED ${event.toolName}: ${decision.reason}`);
    }
  },
});

// Define tools — checkStatus and rollback are free (no rules mention them).
// lint must run before test, test must run before deploy.
// deploy also requires human-approval and is limited to 2 per session.
const tools = gate.wrapTools({
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
    description: "Deploy to an environment",
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
  rollback: tool({
    description: "Rollback to the previous deployment",
    inputSchema: z.object({
      environment: z.enum(["production", "staging"]),
    }),
    execute: async ({ environment }) => pipeline.rollback(environment),
  }),
});

const result = await generateText({
  model: anthropic("claude-sonnet-4-5-20250929"),
  system: `You are a deployment agent that manages CI/CD pipelines.\n\n${gate.systemPrompt()}`,
  tools,
  stopWhen: stepCountIs(15),
  prompt:
    "Deploy the latest version to production. Then deploy again to staging.",
});

console.log("\n--- Final Response ---");
console.log(result.text);
