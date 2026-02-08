#!/usr/bin/env bun
import { analyse } from "@petriflow/engine";
import type { WorkflowDefinition } from "@petriflow/engine";
import { formatAnalysis, formatJson } from "./format.js";

function usage(): never {
  console.log(`Usage: petriflow analyse <workflow.ts> [options]

Options:
  --dot      Output Graphviz DOT format
  --json     Output JSON
  --strict   Exit 1 if deadlocks found or invariants violated
  --help     Show this help`);
  process.exit(0);
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes("--help")) {
    usage();
  }

  const command = args[0];
  if (command !== "analyse" && command !== "analyze") {
    console.error(`Unknown command: ${command}`);
    console.error("Available commands: analyse");
    process.exit(1);
  }

  const file = args[1];
  if (!file) {
    console.error("Error: workflow file path required");
    process.exit(1);
  }

  const dot = args.includes("--dot");
  const json = args.includes("--json");
  const strict = args.includes("--strict");

  let definition: WorkflowDefinition<string, Record<string, unknown>>;
  try {
    const { resolve } = await import("path");
    const absolute = resolve(process.cwd(), file);
    const mod = await import(absolute);
    // Support both default export and named `definition` export
    definition = mod.default ?? mod.definition;
    if (!definition) {
      console.error(
        "Error: workflow file must export a WorkflowDefinition as default or named 'definition'",
      );
      process.exit(1);
    }
  } catch (err) {
    console.error(`Error loading workflow: ${(err as Error).message}`);
    process.exit(1);
  }

  const result = analyse(definition, { dot });

  if (json) {
    console.log(formatJson(result));
  } else {
    console.log(formatAnalysis(result));
    if (dot && result.dot) {
      console.log("\n--- DOT ---");
      console.log(result.dot);
    }
  }

  if (strict) {
    if (result.unexpectedTerminalStates.length > 0) {
      console.error(
        `\n\x1b[31mSTRICT: ${result.unexpectedTerminalStates.length} unexpected terminal state(s) (workflow can get stuck)\x1b[0m`,
      );
      process.exit(1);
    }
    for (const inv of result.invariants) {
      if (!inv.holds) {
        const weights = Object.entries(inv.weights)
          .map(([k, v]) => `${v}·${k}`)
          .join(" + ");
        console.error(
          `\n\x1b[31mSTRICT: Invariant violated: ${weights} = const\x1b[0m`,
        );
        process.exit(1);
      }
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
