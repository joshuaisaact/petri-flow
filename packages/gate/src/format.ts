import type { SkillNet } from "./types.js";

/**
 * Generate a user-facing block reason from a net's rule metadata.
 *
 * With metadata (from the rules compiler), returns a constraint-stating message:
 *   - sequence: "deploy requires a successful call to test first."
 *   - limit:    "deploy has reached its limit of 3 calls per session."
 *   - block:    "rm is blocked and cannot be called."
 *   - approval: "deploy requires human approval."
 *
 * Without metadata (hand-built nets), falls back to a generic message.
 */
export function formatBlockReason(
  net: SkillNet<string>,
  resolvedTool: string,
): string {
  const meta = net.ruleMetadata;

  if (meta) {
    switch (meta.kind) {
      case "sequence":
        return `${meta.dependent} requires a successful call to ${meta.prerequisite} first.`;
      case "limit":
        return meta.scope === "session"
          ? `${meta.tool} has reached its limit of ${meta.limit} calls per session.`
          : `${meta.tool} has reached its limit of ${meta.limit} calls per ${meta.scope}.`;
      case "block":
        return `${meta.tool} is blocked and cannot be called.`;
      case "approval":
        return `${meta.tool} requires human approval.`;
    }
  }

  return `Tool '${resolvedTool}' is not available in the current state.`;
}
