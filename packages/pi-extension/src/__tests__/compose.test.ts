import { describe, expect, it } from "bun:test";
import type {
  ToolCallEvent,
  ToolResultEvent,
  ExtensionContext,
  ExtensionAPI,
} from "@mariozechner/pi-coding-agent";
import { defineSkillNet } from "@petriflow/gate";
import { composeGates } from "../index.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let callIdCounter = 0;
function makeEvent(toolName: string, input: Record<string, unknown> = {}): ToolCallEvent {
  return {
    type: "tool_call",
    toolCallId: `call-${++callIdCounter}`,
    toolName,
    input,
  } as ToolCallEvent;
}

function makeBashEvent(command: string): ToolCallEvent {
  return makeEvent("bash", { command });
}


function makeCtx(confirmResult = true): ExtensionContext {
  return {
    hasUI: true,
    ui: {
      confirm: async () => confirmResult,
      notify: () => {},
    },
  } as unknown as ExtensionContext;
}

// ---------------------------------------------------------------------------
// Mock ExtensionAPI — captures registered handlers
// ---------------------------------------------------------------------------

type ToolCallHandler = (event: ToolCallEvent, ctx: ExtensionContext) => Promise<{ block?: boolean; reason?: string } | void>;
type ToolResultHandler = (event: ToolResultEvent) => void;
type BeforeAgentHandler = (event: { systemPrompt: string }) => { systemPrompt: string } | void;

function mockPi() {
  const handlers: {
    tool_call?: ToolCallHandler;
    tool_result?: ToolResultHandler;
    before_agent_start?: BeforeAgentHandler;
  } = {};
  const commands: Record<string, { description: string; handler: (...args: unknown[]) => Promise<void> }> = {};

  const pi = {
    on(event: string, handler: (...args: unknown[]) => unknown) {
      (handlers as Record<string, unknown>)[event] = handler;
    },
    registerCommand(name: string, cmd: { description: string; handler: (...args: unknown[]) => Promise<void> }) {
      commands[name] = cmd;
    },
  } as unknown as ExtensionAPI;

  return { pi, handlers, commands };
}

// ---------------------------------------------------------------------------
// Synthetic nets
// ---------------------------------------------------------------------------

const netA = defineSkillNet({
  name: "netA",
  places: ["idle", "ready"],
  terminalPlaces: [],
  freeTools: ["safe", "read"],
  initialMarking: { idle: 1, ready: 0 },
  transitions: [
    { name: "start", type: "auto" as const, inputs: ["idle"], outputs: ["ready"] },
    { name: "useDangerous", type: "auto" as const, inputs: ["ready"], outputs: ["ready"], tools: ["dangerous"] },
  ],
});

const netC = defineSkillNet({
  name: "netC",
  places: ["idle", "ready"],
  terminalPlaces: [],
  freeTools: ["safe", "read"],
  initialMarking: { idle: 1, ready: 0 },
  transitions: [
    { name: "start", type: "auto" as const, inputs: ["idle"], outputs: ["ready"] },
    { name: "useSpecial", type: "auto" as const, inputs: ["ready"], outputs: ["ready"], tools: ["special"] },
  ],
});

const netE = defineSkillNet({
  name: "netE",
  places: ["locked"],
  terminalPlaces: [],
  freeTools: ["safe"],
  initialMarking: { locked: 1 },
  transitions: [
    { name: "useDangerous", type: "auto" as const, inputs: ["locked"], outputs: ["locked"], tools: ["something-else"] },
    { name: "realDangerous", type: "auto" as const, inputs: ["unlocked" as string], outputs: ["locked"], tools: ["dangerous"] },
  ],
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setupComposition(nets: ReturnType<typeof defineSkillNet>[]) {
  const { pi, handlers, commands } = mockPi();
  const gate = composeGates(nets);
  gate(pi);
  return { handlers, commands };
}

function setupRegistryComposition(
  registry: Record<string, ReturnType<typeof defineSkillNet>>,
  active?: string[],
) {
  const { pi, handlers, commands } = mockPi();
  const gate = composeGates({ registry, active });
  gate(pi);
  return { handlers, commands };
}

// ---------------------------------------------------------------------------
// Tests — pi-mono adapter wiring
// ---------------------------------------------------------------------------

describe("composeGates — wiring", () => {
  it("registers tool_call, tool_result, before_agent_start handlers", () => {
    const { handlers } = setupComposition([netA]);
    expect(handlers.tool_call).toBeDefined();
    expect(handlers.tool_result).toBeDefined();
    expect(handlers.before_agent_start).toBeDefined();
  });

  it("registers net-status command", () => {
    const { commands } = setupComposition([netA]);
    expect(commands["net-status"]).toBeDefined();
  });

  it("array form — no add-net/remove-net commands", () => {
    const { commands } = setupComposition([netA, netC]);
    expect(commands["add-net"]).toBeUndefined();
    expect(commands["remove-net"]).toBeUndefined();
    expect(commands["net-status"]).toBeDefined();
  });

  it("registry form — has add-net/remove-net commands", () => {
    const { commands } = setupRegistryComposition({ netA, netC });
    expect(commands["add-net"]).toBeDefined();
    expect(commands["remove-net"]).toBeDefined();
    expect(commands["net-status"]).toBeDefined();
  });
});

describe("composeGates — tool_call handler", () => {
  it("allows tools free in all nets", async () => {
    const { handlers } = setupComposition([netA, netC]);
    const result = await handlers.tool_call!(makeEvent("safe"), makeCtx());
    expect(result).toBeUndefined();
  });

  it("blocks when one net blocks", async () => {
    const { handlers } = setupComposition([netA, netE]);
    const result = await handlers.tool_call!(makeEvent("dangerous"), makeCtx());
    expect(result).toEqual({ block: true, reason: expect.stringContaining("netE") });
  });

  it("allows when net abstains and other allows", async () => {
    const { handlers } = setupComposition([netA, netC]);
    const result = await handlers.tool_call!(makeEvent("dangerous"), makeCtx());
    expect(result).toBeUndefined();
  });
});

describe("composeGates — system prompt and commands", () => {
  it("aggregates all nets in system prompt", () => {
    const { handlers } = setupComposition([netA, netC]);
    const result = handlers.before_agent_start!({ systemPrompt: "base" });
    const sys = (result as { systemPrompt: string }).systemPrompt;

    expect(sys).toContain("## Active Petri Nets (composed)");
    expect(sys).toContain("### netA");
    expect(sys).toContain("### netC");
  });

  it("net-status command shows all markings", async () => {
    const { commands } = setupComposition([netA, netC]);
    let notified = "";
    const ctx = {
      hasUI: true,
      ui: { notify: (msg: string) => { notified = msg; } },
    } as unknown as ExtensionContext;

    await commands["net-status"]!.handler(undefined, ctx);
    expect(notified).toContain("netA");
    expect(notified).toContain("netC");
  });
});

describe("composeGates — dynamic management via pi-mono", () => {
  it("/add-net activates a net", async () => {
    const { handlers, commands } = setupRegistryComposition(
      { netA, netC },
      ["netA"],
    );

    // "special" passes because netC is inactive
    const result1 = await handlers.tool_call!(makeEvent("special"), makeCtx());
    expect(result1).toBeUndefined();

    // Activate netC
    let notified = "";
    const ctx = makeCtx();
    (ctx as any).ui.notify = (msg: string) => { notified = msg; };
    await commands["add-net"]!.handler("netC", ctx);
    expect(notified).toContain("Activated");

    // Now "special" is gated by netC (allowed because transition is enabled)
    const result2 = await handlers.tool_call!(makeEvent("special"), makeCtx());
    expect(result2).toBeUndefined();
  });

  it("/remove-net deactivates a net", async () => {
    const { handlers, commands } = setupRegistryComposition({ netA, netE });

    // "dangerous" is blocked by netE
    const result1 = await handlers.tool_call!(makeEvent("dangerous"), makeCtx());
    expect(result1).toEqual({ block: true, reason: expect.stringContaining("netE") });

    // Remove netE
    let notified = "";
    const ctx = makeCtx();
    (ctx as any).ui.notify = (msg: string) => { notified = msg; };
    await commands["remove-net"]!.handler("netE", ctx);
    expect(notified).toContain("Deactivated");

    // Now "dangerous" passes through netA only
    const result2 = await handlers.tool_call!(makeEvent("dangerous"), makeCtx());
    expect(result2).toBeUndefined();
  });

  it("net-status shows active/inactive in registry mode", async () => {
    const { commands } = setupRegistryComposition(
      { netA, netC },
      ["netA"],
    );

    let notified = "";
    const ctx = makeCtx();
    (ctx as any).ui.notify = (msg: string) => { notified = msg; };

    await commands["net-status"]!.handler(undefined, ctx);
    expect(notified).toContain("netA (active)");
    expect(notified).toContain("netC (inactive)");
  });

  it("system prompt only includes active nets", () => {
    const { handlers } = setupRegistryComposition(
      { netA, netC },
      ["netA"],
    );

    const result = handlers.before_agent_start!({ systemPrompt: "" });
    const sys = (result as { systemPrompt: string }).systemPrompt;
    expect(sys).toContain("### netA");
    expect(sys).not.toContain("### netC");
  });

  it("unknown net name shows error", async () => {
    const { commands } = setupRegistryComposition({ netA });

    let notified = "";
    const ctx = makeCtx();
    (ctx as any).ui.notify = (msg: string) => { notified = msg; };

    await commands["add-net"]!.handler("nonexistent", ctx);
    expect(notified).toContain("Unknown net");
    expect(notified).toContain("netA");
  });

  it("add already-active net shows notification", async () => {
    const { commands } = setupRegistryComposition({ netA });

    let notified = "";
    const ctx = makeCtx();
    (ctx as any).ui.notify = (msg: string) => { notified = msg; };

    await commands["add-net"]!.handler("netA", ctx);
    expect(notified).toContain("already active");
  });

  it("remove inactive net shows notification", async () => {
    const { commands } = setupRegistryComposition(
      { netA, netC },
      ["netA"],
    );

    let notified = "";
    const ctx = makeCtx();
    (ctx as any).ui.notify = (msg: string) => { notified = msg; };

    await commands["remove-net"]!.handler("netC", ctx);
    expect(notified).toContain("not active");
    expect(notified).toContain("netA");
  });
});

describe("composeGates — real nets composition", () => {
  it("compose communicate + cleanup: read is free in both", async () => {
    const { communicateNet } = await import("../../../pi-assistant/src/nets/communicate.js");
    const { cleanupNet } = await import("../../../pi-assistant/src/nets/cleanup.js");

    const { handlers } = setupComposition([communicateNet, cleanupNet]);
    const result = await handlers.tool_call!(makeEvent("read"), makeCtx());
    expect(result).toBeUndefined();
  });

  it("compose communicate + cleanup: rm -rf blocked by cleanup", async () => {
    const { communicateNet } = await import("../../../pi-assistant/src/nets/communicate.js");
    const { cleanupNet } = await import("../../../pi-assistant/src/nets/cleanup.js");

    const { handlers } = setupComposition([communicateNet, cleanupNet]);
    const result = await handlers.tool_call!(makeBashEvent("rm -rf build/"), makeCtx());
    expect(result).toEqual({ block: true, reason: expect.stringContaining("cleanup") });
  });

  it("compose communicate + cleanup: slack send gated by communicate", async () => {
    const { communicateNet } = await import("../../../pi-assistant/src/nets/communicate.js");
    const { cleanupNet } = await import("../../../pi-assistant/src/nets/cleanup.js");

    const { handlers } = setupComposition([communicateNet, cleanupNet]);
    const result = await handlers.tool_call!(
      makeEvent("slack", { action: "sendMessage", to: "channel:C123" }),
      makeCtx(),
    );
    expect(result).toEqual({ block: true, reason: expect.stringContaining("communicate") });
  });
});
