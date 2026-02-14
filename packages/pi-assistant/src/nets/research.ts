import type { Marking } from "@petriflow/engine";
import { defineSkillNet } from "@petriflow/gate";
import type { ToolEvent } from "@petriflow/gate";

// -----------------------------------------------------------------------
// Tool mapping
// -----------------------------------------------------------------------

/**
 * Map tool events to virtual tools:
 *   - bash with curl/wget/httpie to external URLs → "web-fetch"
 *   - slack sendMessage → "share"
 *   - everything else → passthrough (free)
 */
function mapTool(event: ToolEvent): string {
  if (event.toolName === "bash") {
    const cmd = (event.input as { command?: string }).command ?? "";
    // External HTTP requests count as research
    if (/\b(curl|wget|httpie?|http)\s+.*https?:\/\//.test(cmd)) return "web-fetch";
    return "bash";
  }

  if (event.toolName === "slack") {
    const action = (event.input as { action?: string }).action ?? "";
    if (action === "sendMessage") return "share";
    return event.toolName;
  }

  return event.toolName;
}

// -----------------------------------------------------------------------
// Net definition
// -----------------------------------------------------------------------

const places = ["idle", "researching", "canShare"] as const;
type Place = (typeof places)[number];

const initialMarking: Marking<Place> = {
  idle: 1,
  researching: 0,
  canShare: 0,
};

/**
 * Research skill net — research-before-share.
 *
 * Safety property: The agent cannot share findings (post to Slack,
 * email, etc.) without having done actual research first. Each
 * web fetch earns one share token; each share consumes one.
 * This prevents the agent from making things up and blasting
 * them to channels without sourcing.
 *
 * Flow:
 *   idle → researching (auto)
 *   researching + [web-fetch, deferred] → researching + canShare
 *     (successful fetch earns a share token; researching stays)
 *   canShare + [share] → (consumed)
 *
 * Free tools: read, write, edit, bash, ls, grep, find, slack (non-send)
 * The agent can do unlimited local research — only web fetches
 * and outbound shares are gated.
 */
export const researchNet = defineSkillNet<Place>({
  name: "research",
  places: [...places],
  terminalPlaces: [],
  freeTools: [
    "read", "write", "edit", "bash", "ls", "grep", "find",
    // Non-send slack actions are free
    "slack", "react", "readMessages",
  ],
  initialMarking,
  toolMapper: mapTool,

  transitions: [
    {
      name: "start",
      type: "auto",
      inputs: ["idle"],
      outputs: ["researching"],
    },
    // Web fetch: self-loop on researching + produces canShare token.
    // Deferred: only earns share token if the fetch actually succeeds.
    {
      name: "fetch",
      type: "auto",
      inputs: ["researching"],
      outputs: ["researching", "canShare"],
      tools: ["web-fetch"],
      deferred: true,
    },
    // Share: consumes a canShare token. No output to canShare — it's gone.
    {
      name: "share",
      type: "auto",
      inputs: ["canShare"],
      outputs: [],
      tools: ["share"],
    },
  ],
});
