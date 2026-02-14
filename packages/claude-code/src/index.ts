import { resolve } from "node:path";

// Re-export the default net
export { safeCodingNet } from "./nets/safe-coding.js";

// Re-export gate essentials for user config files
export { defineSkillNet, createGateManager } from "@petriflow/gate";
export type { SkillNet, GateManagerOptions } from "@petriflow/gate";

// ---------------------------------------------------------------------------
// configure() — generate Claude Code hooks config
// ---------------------------------------------------------------------------

type HookHandler = {
  type: "command";
  command: string;
};

type MatcherGroup = {
  matcher?: string;
  hooks: HookHandler[];
};

type HooksConfig = {
  hooks: Record<string, MatcherGroup[]>;
};

/**
 * Generate the Claude Code hooks configuration to merge into
 * `.claude/settings.json`. The command points to the hook entry point
 * in node_modules.
 */
export function configure(projectDir: string): HooksConfig {
  const hookPath = resolve(projectDir, "node_modules", "@petriflow", "claude-code", "src", "hook.ts");
  const command = `bun run ${hookPath}`;

  const group: MatcherGroup = { hooks: [{ type: "command", command }] };

  return {
    hooks: {
      SessionStart: [group],
      PreToolUse: [group],
      PostToolUse: [group],
      PostToolUseFailure: [group],
    },
  };
}
