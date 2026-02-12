import { definition } from "./scenarios/tool-approval.js";
import {
  enabledWorkflowTransitions,
  fireWorkflow,
} from "@petriflow/engine";
import type { Marking, ExecuteFn } from "@petriflow/engine";
import { generateText, tool } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import * as readline from "node:readline";

// ── Types ───────────────────────────────────────────────────────
// Infer Place from the definition's marking keys
type Place = string & keyof typeof definition.net.initialMarking;
type Ctx = Record<string, unknown>;

// ── Helpers ─────────────────────────────────────────────────────
function nonZeroMarking(marking: Marking<Place>): string {
  return Object.entries(marking)
    .filter(([, v]) => (v as number) > 0)
    .map(([k, v]) => `${k}=${v}`)
    .join(", ");
}

function isTerminal(marking: Marking<Place>): boolean {
  return definition.terminalPlaces.every(
    (p) => (marking[p] ?? 0) > 0,
  );
}

function ask(prompt: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stderr,
  });
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

// ── Executors ───────────────────────────────────────────────────
const executors = new Map<string, ExecuteFn<Place, Ctx>>();

executors.set("execSearch", async (ctx) => {
  const result = "Search results: found 3 relevant files matching the query.";
  console.log(`  [execSearch] ${result}`);
  return { searchResult: result };
});

executors.set("execFileRead", async (ctx) => {
  const result = "File contents: configuration loaded successfully (42 lines).";
  console.log(`  [execFileRead] ${result}`);
  return { fileReadResult: result };
});

executors.set("execShell", async (ctx) => {
  const result = "Shell output: command executed successfully (exit code 0).";
  console.log(`  [execShell] ${result}`);
  return { shellResult: result };
});

executors.set("generateResponse", async (ctx) => {
  console.log("  [generateResponse] Calling Claude to synthesize response...");
  const result = await generateText({
    model: anthropic("claude-sonnet-4-5-20250929"),
    system: "You are synthesizing tool results into a final answer. Be concise.",
    prompt: `Synthesize these tool results into a brief response:
- Search: ${ctx.searchResult ?? "no results"}
- File read: ${ctx.fileReadResult ?? "no results"}
- Shell: ${ctx.shellResult ?? "skipped"}`,
    maxOutputTokens: 256,
  });
  console.log(`  [generateResponse] ${result.text}`);
  return { finalResponse: result.text };
});

// ── LLM decision ────────────────────────────────────────────────
async function llmChoose(
  enabled: { name: string; inputs: Place[]; outputs: Place[] }[],
  marking: Marking<Place>,
  ctx: Ctx,
): Promise<{ transition: string; reasoning: string }> {
  const transitionNames = enabled.map((t) => t.name);

  const result = await generateText({
    model: anthropic("claude-sonnet-4-5-20250929"),
    system: `You are a workflow controller for the "tool-approval" scenario. You control an AI agent that has received a task requiring search, file-read, and shell tools. Pick the best transition to fire next.`,
    prompt: `Current marking: ${nonZeroMarking(marking)}
Context: ${JSON.stringify(ctx)}

Enabled transitions:
${enabled.map((t) => `  ${t.name}: consumes [${t.inputs.join(", ")}] → produces [${t.outputs.join(", ")}]`).join("\n")}

Pick the transition to fire.`,
    tools: {
      pickTransition: tool({
        description: "Choose which transition to fire next",
        inputSchema: z.object({
          transition: z.enum(transitionNames as [string, ...string[]]),
          reasoning: z.string().describe("Brief reasoning for this choice"),
        }),
      }),
    },
    toolChoice: { type: "tool", toolName: "pickTransition" },
    maxOutputTokens: 256,
  });

  const call = result.toolCalls[0];
  return { transition: call.input.transition, reasoning: call.input.reasoning };
}

// ── Main loop ───────────────────────────────────────────────────
async function main() {
  let marking: Marking<Place> = { ...definition.net.initialMarking };
  let ctx: Ctx = { ...definition.initialContext };
  let step = 0;

  console.log("═══ OpenClaw Tool-Approval Interactive Runner ═══");
  console.log(`Initial marking: ${nonZeroMarking(marking)}\n`);

  while (!isTerminal(marking)) {
    step++;
    const enabled = enabledWorkflowTransitions(
      definition.net,
      marking,
      ctx,
      definition.guards,
    );

    if (enabled.length === 0) {
      console.log(`\n✗ Step ${step}: No enabled transitions — deadlock!`);
      break;
    }

    const manual = enabled.filter((t) => t.type === "manual");
    const auto = enabled.filter((t) => t.type !== "manual");

    let chosenName: string;
    let reasoning = "";

    if (auto.length > 0) {
      // Automatic transitions: LLM picks (or auto-fire if only one)
      if (auto.length === 1) {
        chosenName = auto[0].name;
        reasoning = "only enabled automatic transition";
      } else {
        const decision = await llmChoose(auto, marking, ctx);
        chosenName = decision.transition;
        reasoning = decision.reasoning;
      }
    } else {
      // Only manual transitions available — prompt the human
      console.log(`\n── Step ${step}: Manual decision required ──`);
      manual.forEach((t, i) => {
        console.log(`  [${i + 1}] ${t.name}`);
      });
      const answer = await ask(`Pick transition (1-${manual.length}): `);
      const idx = parseInt(answer, 10) - 1;
      if (idx < 0 || idx >= manual.length) {
        console.log("  Invalid choice, retrying...");
        step--;
        continue;
      }
      chosenName = manual[idx].name;
      reasoning = "human choice";
    }

    const transition = enabled.find((t) => t.name === chosenName)!;

    console.log(
      `\n► Step ${step}: firing "${chosenName}"${reasoning ? ` (${reasoning})` : ""}`,
    );

    const result = await fireWorkflow(
      marking,
      transition,
      ctx,
      definition.guards,
      executors,
    );

    marking = result.marking;
    ctx = result.context;

    console.log(`  Marking: ${nonZeroMarking(marking)}`);
  }

  if (isTerminal(marking)) {
    console.log(`\n═══ Terminal state reached in ${step} steps ═══`);
    if (ctx.finalResponse) {
      console.log(`\nFinal response:\n${ctx.finalResponse}`);
    }
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
