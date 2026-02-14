#!/usr/bin/env bun

import { createGateManager } from "@petriflow/gate";
import type { SkillNet, GateManagerOptions } from "@petriflow/gate";
import { saveState, restoreState, clearState } from "./state.js";
import { safeCodingNet } from "./nets/safe-coding.js";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

// ---------------------------------------------------------------------------
// Claude Code hook event types (matches actual stdin JSON schema)
// ---------------------------------------------------------------------------

type CommonFields = {
  session_id: string;
  transcript_path: string;
  cwd: string;
  permission_mode: string;
  hook_event_name: string;
};

type SessionStartEvent = CommonFields & {
  hook_event_name: "SessionStart";
  source: string; // "startup" | "resume" | "clear" | "compact"
  model: string;
};

type PreToolUseEvent = CommonFields & {
  hook_event_name: "PreToolUse";
  tool_name: string;
  tool_input: Record<string, unknown>;
  tool_use_id: string;
};

type PostToolUseEvent = CommonFields & {
  hook_event_name: "PostToolUse";
  tool_name: string;
  tool_input: Record<string, unknown>;
  tool_use_id: string;
  tool_response: Record<string, unknown>;
};

type PostToolUseFailureEvent = CommonFields & {
  hook_event_name: "PostToolUseFailure";
  tool_name: string;
  tool_input: Record<string, unknown>;
  tool_use_id: string;
  error: string;
  is_interrupt?: boolean;
};

type HookEvent = SessionStartEvent | PreToolUseEvent | PostToolUseEvent | PostToolUseFailureEvent;

// ---------------------------------------------------------------------------
// Config loading
// ---------------------------------------------------------------------------

type PetriflowConfig = {
  nets: SkillNet<string>[];
  mode: "enforce" | "shadow";
};

function loadConfig(): PetriflowConfig {
  const cwd = process.cwd();
  const configPath = resolve(cwd, ".claude", "petriflow.config.ts");

  if (existsSync(configPath)) {
    // Dynamic import for user config — require is sync and works with bun
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require(configPath);
    const config = mod.default ?? mod;
    return config as PetriflowConfig;
  }

  return { nets: [safeCodingNet], mode: "enforce" };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function log(msg: string): void {
  process.stderr.write(`[petriflow] ${msg}\n`);
}

async function main(): Promise<void> {
  // Read entire stdin
  const input = await Bun.stdin.text();
  if (!input.trim()) return;

  const event: HookEvent = JSON.parse(input);
  const config = loadConfig();

  if (event.hook_event_name === "SessionStart") {
    clearState(event.session_id);
    log("session started — state cleared");
    return;
  }

  const opts: GateManagerOptions = { mode: config.mode };
  const manager = createGateManager(config.nets, opts);

  // Restore state from previous invocation
  restoreState(event.session_id, manager);

  if (event.hook_event_name === "PreToolUse") {
    const decision = await manager.handleToolCall(
      {
        toolCallId: event.tool_use_id,
        toolName: event.tool_name,
        input: event.tool_input,
      },
      { hasUI: false, confirm: async () => false },
    );

    saveState(event.session_id, manager);

    const status = manager.getActiveNets().map((n) => `${n.name}: ${Object.entries(n.state.marking).filter(([,v]) => v > 0).map(([k,v]) => `${k}=${v}`).join(",")}`).join(" | ");

    if (decision?.block) {
      log(`${event.tool_name} → BLOCKED (${config.mode === "shadow" ? "shadow — allowing" : "denied"}) [${status}]`);
      const output = {
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "deny",
          permissionDecisionReason: `[${findBlockingNet(manager, event.tool_name)}] ${decision.reason}`,
        },
      };
      process.stdout.write(JSON.stringify(output));
    } else {
      log(`${event.tool_name} → allow [${status}]`);
    }
    return;
  }

  if (event.hook_event_name === "PostToolUse" || event.hook_event_name === "PostToolUseFailure") {
    const isError = event.hook_event_name === "PostToolUseFailure";
    manager.handleToolResult({
      toolCallId: event.tool_use_id,
      toolName: event.tool_name,
      input: event.tool_input,
      isError,
    });

    saveState(event.session_id, manager);
    log(`${event.tool_name} result (${isError ? "error" : "ok"})`);
    return;
  }
}

/** Best-effort: find which net name would block this tool for the error message. */
function findBlockingNet(manager: ReturnType<typeof createGateManager>, toolName: string): string {
  for (const { name, net } of manager.getActiveNets()) {
    const hasJurisdiction = net.transitions.some((t) => t.tools?.includes(toolName));
    if (hasJurisdiction) return name;
  }
  return manager.getActiveNets()[0]?.name ?? "petriflow";
}

main().catch((err) => {
  process.stderr.write(`[petriflow-hook] ${err}\n`);
  process.exit(1);
});
