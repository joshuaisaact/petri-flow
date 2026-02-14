import { defineSkillNet } from "@petriflow/gate";
import type { SkillNet } from "@petriflow/gate";
import { analyse } from "petri-ts";
import type { PetriNet } from "petri-ts";

// ---------------------------------------------------------------------------
// Parsed types
// ---------------------------------------------------------------------------

type SequenceRule = { kind: "sequence"; a: string; b: string };
type ApprovalRule = { kind: "approval"; b: string };
type BlockRule = { kind: "block"; a: string };
type LimitRule = {
  kind: "limit";
  a: string;
  n: number;
  scope: "session" | { action: string };
};

type ParsedRule = SequenceRule | ApprovalRule | BlockRule | LimitRule;

type ToolMap = {
  kind: "map";
  tool: string;
  field: string;
  pattern: RegExp;
  virtualName: string;
};

type ParsedLine = ParsedRule | ToolMap;

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

function stripComments(line: string): string {
  const idx = line.indexOf("#");
  return idx === -1 ? line : line.slice(0, idx);
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Parse a pattern token into a RegExp.
 * - /pattern/ → raw regex (escape hatch)
 * - bareWord  → word-boundary keyword match (\bbareWord\b)
 */
function parsePattern(token: string, lineNum: number): RegExp {
  if (token.startsWith("/") && token.endsWith("/") && token.length > 1) {
    const body = token.slice(1, -1);
    if (body === "") {
      throw new Error(`Line ${lineNum}: empty regex pattern`);
    }
    return new RegExp(body);
  }

  // Bare word → automatic word-boundary match
  return new RegExp(`\\b${escapeRegex(token)}\\b`);
}

function parseLine(raw: string, lineNum: number): ParsedLine {
  const cleaned = stripComments(raw).trim();
  const tokens = cleaned.split(/\s+/);

  if (tokens.length === 0 || (tokens.length === 1 && tokens[0] === "")) {
    throw new Error(`Line ${lineNum}: empty rule`);
  }

  const keyword = tokens[0]!;

  // map <tool>.<field> <pattern> as <virtual-name>
  if (keyword === "map") {
    if (tokens.length !== 5) {
      throw new Error(
        `Line ${lineNum}: 'map <tool>.<field> <pattern> as <name>' expects 5 tokens, got ${tokens.length}`,
      );
    }
    const toolField = tokens[1]!;
    const dotIdx = toolField.indexOf(".");
    if (dotIdx === -1) {
      throw new Error(
        `Line ${lineNum}: expected <tool>.<field> (e.g., bash.command), got '${toolField}'`,
      );
    }
    const tool = toolField.slice(0, dotIdx);
    const field = toolField.slice(dotIdx + 1);
    if (tool === "" || field === "") {
      throw new Error(
        `Line ${lineNum}: tool and field must be non-empty in '${toolField}'`,
      );
    }
    const pattern = parsePattern(tokens[2]!, lineNum);
    if (tokens[3] !== "as") {
      throw new Error(
        `Line ${lineNum}: expected 'as' at position 4, got '${tokens[3]}'`,
      );
    }
    return { kind: "map", tool, field, pattern, virtualName: tokens[4]! };
  }

  if (keyword === "require") {
    if (tokens[1] === "human-approval") {
      if (tokens.length !== 4) {
        throw new Error(
          `Line ${lineNum}: 'require human-approval before <tool>' expects 4 tokens, got ${tokens.length}`,
        );
      }
      if (tokens[2] !== "before") {
        throw new Error(
          `Line ${lineNum}: expected 'before' at position 3, got '${tokens[2]}'`,
        );
      }
      return { kind: "approval", b: tokens[3]! };
    }

    if (tokens.length !== 4) {
      throw new Error(
        `Line ${lineNum}: 'require <tool> before <tool>' expects 4 tokens, got ${tokens.length}`,
      );
    }
    if (tokens[2] !== "before") {
      throw new Error(
        `Line ${lineNum}: expected 'before' at position 3, got '${tokens[2]}'`,
      );
    }
    return { kind: "sequence", a: tokens[1]!, b: tokens[3]! };
  }

  if (keyword === "limit") {
    if (tokens.length !== 6) {
      throw new Error(
        `Line ${lineNum}: 'limit <tool> to <N> per <scope>' expects 6 tokens, got ${tokens.length}`,
      );
    }
    if (tokens[2] !== "to") {
      throw new Error(
        `Line ${lineNum}: expected 'to' at position 3, got '${tokens[2]}'`,
      );
    }
    if (tokens[4] !== "per") {
      throw new Error(
        `Line ${lineNum}: expected 'per' at position 5, got '${tokens[4]}'`,
      );
    }
    const n = parseInt(tokens[3]!, 10);
    if (isNaN(n) || n <= 0) {
      throw new Error(
        `Line ${lineNum}: limit count must be a positive integer, got '${tokens[3]}'`,
      );
    }
    const scopeToken = tokens[5]!;
    const scope: LimitRule["scope"] =
      scopeToken === "session" ? "session" : { action: scopeToken };
    return { kind: "limit", a: tokens[1]!, n, scope };
  }

  if (keyword === "block") {
    if (tokens.length !== 2) {
      throw new Error(
        `Line ${lineNum}: 'block <tool>' expects 2 tokens, got ${tokens.length}`,
      );
    }
    return { kind: "block", a: tokens[1]! };
  }

  throw new Error(
    `Line ${lineNum}: unknown keyword '${keyword}'. Expected 'map', 'require', 'limit', or 'block'`,
  );
}

// ---------------------------------------------------------------------------
// Compiler — parsed rule → SkillNet
// ---------------------------------------------------------------------------

function compileSequence(rule: SequenceRule): SkillNet<string> {
  return defineSkillNet({
    name: `require-${rule.a}-before-${rule.b}`,
    places: ["idle", "ready", "gate"],
    initialMarking: { idle: 1, ready: 0, gate: 0 },
    transitions: [
      { name: "start", type: "auto", inputs: ["idle"], outputs: ["ready"] },
      {
        name: `do-${rule.a}`,
        type: "auto",
        inputs: ["ready"],
        outputs: ["gate"],
        tools: [rule.a],
        deferred: true,
      },
      {
        name: `do-${rule.b}`,
        type: "auto",
        inputs: ["gate"],
        outputs: ["ready"],
        tools: [rule.b],
      },
    ],
    freeTools: [],
    terminalPlaces: [],
  });
}

function compileApproval(rule: ApprovalRule): SkillNet<string> {
  return defineSkillNet({
    name: `approve-before-${rule.b}`,
    places: ["idle", "ready"],
    initialMarking: { idle: 1, ready: 0 },
    transitions: [
      { name: "start", type: "auto", inputs: ["idle"], outputs: ["ready"] },
      {
        name: "approve",
        type: "manual",
        inputs: ["ready"],
        outputs: ["ready"],
        tools: [rule.b],
      },
    ],
    freeTools: [],
    terminalPlaces: [],
  });
}

function compileBlock(rule: BlockRule): SkillNet<string> {
  return defineSkillNet({
    name: `block-${rule.a}`,
    places: ["idle", "ready", "locked"],
    initialMarking: { idle: 1, ready: 0, locked: 0 },
    transitions: [
      { name: "start", type: "auto", inputs: ["idle"], outputs: ["ready"] },
      {
        name: `do-${rule.a}`,
        type: "auto",
        inputs: ["locked"],
        outputs: ["locked"],
        tools: [rule.a],
      },
    ],
    freeTools: [],
    terminalPlaces: [],
  });
}

function compileLimit(rule: LimitRule): SkillNet<string> {
  if (rule.scope === "session") {
    return defineSkillNet({
      name: `limit-${rule.a}-${rule.n}`,
      places: ["idle", "ready", "budget"],
      initialMarking: { idle: 1, ready: 0, budget: rule.n },
      transitions: [
        { name: "start", type: "auto", inputs: ["idle"], outputs: ["ready"] },
        {
          name: `do-${rule.a}`,
          type: "auto",
          inputs: ["ready", "budget"],
          outputs: ["ready"],
          tools: [rule.a],
        },
      ],
      freeTools: [],
      terminalPlaces: [],
    });
  }

  const action = rule.scope.action;
  return defineSkillNet({
    name: `limit-${rule.a}-${rule.n}-per-${action}`,
    places: ["idle", "ready", "budget", "spent"],
    initialMarking: { idle: 1, ready: 0, budget: rule.n, spent: 0 },
    transitions: [
      { name: "start", type: "auto", inputs: ["idle"], outputs: ["ready"] },
      {
        name: `do-${rule.a}`,
        type: "auto",
        inputs: ["ready", "budget"],
        outputs: ["ready", "spent"],
        tools: [rule.a],
      },
      {
        name: "refill",
        type: "auto",
        inputs: ["ready", "spent"],
        outputs: ["ready", "budget"],
        tools: [action],
      },
    ],
    freeTools: [],
    terminalPlaces: [],
  });
}

// ---------------------------------------------------------------------------
// Tool mapper generation
// ---------------------------------------------------------------------------

/**
 * Collect base tool names from dotted references in transitions.
 * e.g., "discord.sendMessage" → base "discord"
 */
function collectDottedBases(net: SkillNet<string>): Set<string> {
  const bases = new Set<string>();
  for (const t of net.transitions) {
    for (const tool of t.tools ?? []) {
      const dotIdx = tool.indexOf(".");
      if (dotIdx !== -1) {
        bases.add(tool.slice(0, dotIdx));
      }
    }
  }
  return bases;
}

/**
 * Build a toolMapper function that handles both:
 * - Dot notation: discord + input.action → discord.sendMessage
 * - Map statements: bash + input.command matches /rm/ → delete
 */
function buildToolMapper(
  net: SkillNet<string>,
  maps: ToolMap[],
): SkillNet<string> {
  const dottedBases = collectDottedBases(net);
  if (dottedBases.size === 0 && maps.length === 0) return net;

  return {
    ...net,
    toolMapper: ({ toolName, input }) => {
      // Map statements take priority (more specific)
      for (const m of maps) {
        if (toolName === m.tool) {
          const fieldValue = input[m.field];
          if (typeof fieldValue === "string" && m.pattern.test(fieldValue)) {
            return m.virtualName;
          }
        }
      }

      // Dot notation: tool + input.action
      if (dottedBases.has(toolName) && typeof input.action === "string") {
        return `${toolName}.${input.action}`;
      }

      return toolName;
    },
  };
}

function compileRule(rule: ParsedRule): SkillNet<string> {
  switch (rule.kind) {
    case "sequence":
      return compileSequence(rule);
    case "approval":
      return compileApproval(rule);
    case "block":
      return compileBlock(rule);
    case "limit":
      return compileLimit(rule);
  }
}

// ---------------------------------------------------------------------------
// Verification
// ---------------------------------------------------------------------------

/** Convert a SkillNet to a plain PetriNet for analysis. */
function toPetriNet(net: SkillNet<string>): PetriNet<string> {
  return {
    transitions: net.transitions.map((t) => ({
      name: t.name,
      inputs: t.inputs,
      outputs: t.outputs,
    })),
    initialMarking: net.initialMarking,
  };
}

export type NetVerification = {
  name: string;
  reachableStates: number;
};

function verifyNets(nets: SkillNet<string>[]): NetVerification[] {
  return nets.map((net) => {
    const result = analyse(toPetriNet(net));
    return {
      name: net.name,
      reachableStates: result.reachableStateCount,
    };
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export type CompiledRules = {
  nets: SkillNet<string>[];
  verification: NetVerification[];
};

/** Compile rule strings into skill nets. Verifies each net automatically. */
export function compile(rules: string | string[]): CompiledRules {
  const lines =
    typeof rules === "string"
      ? rules.split("\n")
      : rules.flatMap((r) => r.split("\n"));

  const maps: ToolMap[] = [];
  const parsedRules: ParsedRule[] = [];

  for (let i = 0; i < lines.length; i++) {
    const cleaned = stripComments(lines[i]!).trim();
    if (cleaned === "") continue;

    const parsed = parseLine(cleaned, i + 1);
    if (parsed.kind === "map") {
      maps.push(parsed);
    } else {
      parsedRules.push(parsed);
    }
  }

  const nets = parsedRules.map((rule) => buildToolMapper(compileRule(rule), maps));
  const verification = verifyNets(nets);

  return { nets, verification };
}
