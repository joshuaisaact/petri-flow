import { defineSkillNet } from "@petriflow/gate";
import type { SkillNet } from "@petriflow/gate";

// ---------------------------------------------------------------------------
// Parsed rule types
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

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

function stripComments(line: string): string {
  const idx = line.indexOf("#");
  return idx === -1 ? line : line.slice(0, idx);
}

function parseRule(raw: string, lineNum: number): ParsedRule {
  const cleaned = stripComments(raw).trim();
  const tokens = cleaned.split(/\s+/);

  if (tokens.length === 0 || (tokens.length === 1 && tokens[0] === "")) {
    throw new Error(`Line ${lineNum}: empty rule`);
  }

  const keyword = tokens[0]!;

  if (keyword === "require") {
    if (tokens[1] === "human-approval") {
      // require human-approval before <B>
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

    // require <A> before <B>
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
    // limit <A> to <N> per <scope>
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
    `Line ${lineNum}: unknown keyword '${keyword}'. Expected 'require', 'limit', or 'block'`,
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
      {
        name: "refill",
        type: "auto",
        inputs: ["ready"],
        outputs: ["ready", "budget"],
        tools: [action],
      },
    ],
    freeTools: [],
    terminalPlaces: [],
  });
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
// Public API
// ---------------------------------------------------------------------------

export type CompiledRules = { nets: SkillNet<string>[] };

/** Compile rule strings into skill nets. */
export function compile(rules: string | string[]): CompiledRules {
  const lines =
    typeof rules === "string"
      ? rules.split("\n")
      : rules.flatMap((r) => r.split("\n"));

  const nets: SkillNet<string>[] = [];

  for (let i = 0; i < lines.length; i++) {
    const cleaned = stripComments(lines[i]!).trim();
    if (cleaned === "") continue;

    const parsed = parseRule(cleaned, i + 1);
    nets.push(compileRule(parsed));
  }

  return { nets };
}
