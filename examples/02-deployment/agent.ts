import { generateText, tool } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import { loadRules } from "@petriflow/rules";
import { createPetriflowGate } from "@petriflow/vercel-ai";

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
    parameters: z.object({}),
    execute: async () => {
      console.log("> lint");
      return { passed: true, warnings: 0, errors: 0 };
    },
  }),
  test: tool({
    description: "Run the test suite",
    parameters: z.object({}),
    execute: async () => {
      console.log("> test");
      return { passed: true, total: 42, failed: 0 };
    },
  }),
  deploy: tool({
    description: "Deploy to an environment",
    parameters: z.object({
      environment: z.enum(["production", "staging"]),
    }),
    execute: async ({ environment }) => {
      console.log(`> deploy ${environment}`);
      return { deployed: true, environment, version: "1.4.2" };
    },
  }),
  checkStatus: tool({
    description: "Check the current deployment status",
    parameters: z.object({
      environment: z.enum(["production", "staging"]),
    }),
    execute: async ({ environment }) => {
      console.log(`> checkStatus ${environment}`);
      return { environment, status: "healthy", version: "1.4.1" };
    },
  }),
  rollback: tool({
    description: "Rollback to the previous deployment",
    parameters: z.object({
      environment: z.enum(["production", "staging"]),
    }),
    execute: async ({ environment }) => {
      console.log(`> rollback ${environment}`);
      return { rolledBack: true, environment, version: "1.4.0" };
    },
  }),
});

const result = await generateText({
  model: anthropic("claude-sonnet-4-5-20250929"),
  system: `You are a deployment agent that manages CI/CD pipelines.\n\n${gate.systemPrompt()}`,
  tools,
  maxSteps: 15,
  prompt:
    "Deploy the latest version to production. Then deploy again to staging.",
});

console.log("\n--- Final Response ---");
console.log(result.text);
