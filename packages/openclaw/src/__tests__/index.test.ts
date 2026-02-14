import { describe, expect, it } from "bun:test";
import { defineSkillNet } from "@petriflow/gate";
import { createPetriGatePlugin } from "../index.js";
import { toolApprovalNet } from "../../../pi-extension/src/nets/tool-approval.js";

// ---------------------------------------------------------------------------
// Mock OpenClaw plugin API
// ---------------------------------------------------------------------------

type HookHandler = (...args: any[]) => any;

function createMockApi() {
  const hooks = new Map<string, HookHandler[]>();
  const commands = new Map<string, any>();

  return {
    api: {
      id: "test",
      name: "test",
      source: "test",
      config: {} as any,
      runtime: {} as any,
      logger: { info: () => {}, warn: () => {}, error: () => {} },
      on: (name: string, handler: HookHandler) => {
        const list = hooks.get(name) ?? [];
        list.push(handler);
        hooks.set(name, list);
      },
      registerCommand: (cmd: any) => commands.set(cmd.name, cmd),
      registerTool: () => {},
      registerHook: () => {},
      registerHttpHandler: () => {},
      registerHttpRoute: () => {},
      registerChannel: () => {},
      registerGatewayMethod: () => {},
      registerCli: () => {},
      registerService: () => {},
      registerProvider: () => {},
      resolvePath: (p: string) => p,
    } as any,
    hooks,
    commands,
    async callHook(name: string, ...args: any[]) {
      const handlers = hooks.get(name) ?? [];
      let result;
      for (const h of handlers) result = await h(...args);
      return result;
    },
  };
}

// ---------------------------------------------------------------------------
// Test nets
// ---------------------------------------------------------------------------

const simpleNet = defineSkillNet({
  name: "simple",
  places: ["idle", "ready"],
  terminalPlaces: [],
  freeTools: ["ls", "read"],
  initialMarking: { idle: 1, ready: 0 },
  transitions: [
    { name: "start", type: "auto" as const, inputs: ["idle"], outputs: ["ready"] },
    { name: "useBash", type: "auto" as const, inputs: ["ready"], outputs: ["ready"], tools: ["bash"] },
  ],
});

const deferredNet = defineSkillNet({
  name: "deferred",
  places: ["idle", "ready", "backedUp"],
  terminalPlaces: [],
  freeTools: ["ls"],
  initialMarking: { idle: 1, ready: 0, backedUp: 0 },
  transitions: [
    { name: "start", type: "auto" as const, inputs: ["idle"], outputs: ["ready"] },
    { name: "backup", type: "auto" as const, inputs: ["ready"], outputs: ["backedUp"], tools: ["backup"], deferred: true },
    { name: "destroy", type: "auto" as const, inputs: ["backedUp"], outputs: ["ready"], tools: ["destroy"] },
  ],
});

// Has jurisdiction over "bash" but the transition requires "unlocked" which has no tokens
const blockingNet = defineSkillNet({
  name: "blocker",
  places: ["locked", "unlocked"],
  terminalPlaces: [],
  freeTools: ["ls"],
  initialMarking: { locked: 1, unlocked: 0 },
  transitions: [
    { name: "useBash", type: "auto" as const, inputs: ["unlocked"], outputs: ["locked"], tools: ["bash"] },
  ],
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("createPetriGatePlugin — hook registration", () => {
  it("registers before_tool_call and after_tool_call hooks", () => {
    const { api, hooks } = createMockApi();
    const plugin = createPetriGatePlugin([simpleNet]);
    plugin.register!(api);

    expect(hooks.has("before_tool_call")).toBe(true);
    expect(hooks.has("after_tool_call")).toBe(true);
  });

  it("has correct plugin metadata", () => {
    const plugin = createPetriGatePlugin([simpleNet]);
    expect(plugin.id).toBe("petriflow-gate");
    expect(plugin.name).toBe("PetriFlow Gate");
  });
});

describe("createPetriGatePlugin — tool gating", () => {
  it("allows free tools", async () => {
    const { api, callHook } = createMockApi();
    createPetriGatePlugin([simpleNet]).register!(api);

    const result = await callHook("before_tool_call", { toolName: "ls", params: {} }, { toolName: "ls" });
    expect(result).toBeUndefined();
  });

  it("allows gated tools when transition is enabled", async () => {
    const { api, callHook } = createMockApi();
    createPetriGatePlugin([simpleNet]).register!(api);

    const result = await callHook("before_tool_call", { toolName: "bash", params: {} }, { toolName: "bash" });
    expect(result).toBeUndefined();
  });

  it("blocks tools with no matching transition", async () => {
    const { api, callHook } = createMockApi();
    createPetriGatePlugin([blockingNet]).register!(api);

    const result = await callHook("before_tool_call", { toolName: "bash", params: {} }, { toolName: "bash" });
    expect(result).toEqual({ block: true, blockReason: expect.any(String) });
  });

  it("blocks manual transitions (hasUI: false → auto-deny)", async () => {
    const { api, callHook } = createMockApi();
    createPetriGatePlugin([toolApprovalNet]).register!(api);

    const result = await callHook("before_tool_call", { toolName: "bash", params: {} }, { toolName: "bash" });
    expect(result).toEqual({ block: true, blockReason: expect.stringContaining("requires UI") });
  });
});

describe("createPetriGatePlugin — deferred correlation", () => {
  it("deferred tool allowed → after_tool_call resolves → net advances", async () => {
    const { api, callHook } = createMockApi();
    createPetriGatePlugin([deferredNet]).register!(api);

    // before_tool_call allows the backup
    const beforeResult = await callHook(
      "before_tool_call",
      { toolName: "backup", params: {} },
      { toolName: "backup" },
    );
    expect(beforeResult).toBeUndefined();

    // after_tool_call resolves the deferred transition (success)
    await callHook(
      "after_tool_call",
      { toolName: "backup", params: {}, result: "ok", error: undefined },
      { toolName: "backup" },
    );

    // Now "destroy" should be available (net advanced from ready → backedUp)
    const destroyResult = await callHook(
      "before_tool_call",
      { toolName: "destroy", params: {} },
      { toolName: "destroy" },
    );
    expect(destroyResult).toBeUndefined();
  });

  it("deferred tool with error does not advance net", async () => {
    const { api, callHook } = createMockApi();
    createPetriGatePlugin([deferredNet]).register!(api);

    await callHook("before_tool_call", { toolName: "backup", params: {} }, { toolName: "backup" });
    await callHook(
      "after_tool_call",
      { toolName: "backup", params: {}, result: undefined, error: "failed" },
      { toolName: "backup" },
    );

    // "destroy" should still be blocked (net didn't advance)
    const result = await callHook(
      "before_tool_call",
      { toolName: "destroy", params: {} },
      { toolName: "destroy" },
    );
    expect(result).toEqual({ block: true, blockReason: expect.any(String) });
  });

  it("blocked tools don't leak IDs into the pending queue", async () => {
    const { api, callHook } = createMockApi();
    createPetriGatePlugin([blockingNet]).register!(api);

    // This gets blocked
    const result = await callHook("before_tool_call", { toolName: "bash", params: {} }, { toolName: "bash" });
    expect(result?.block).toBe(true);

    // after_tool_call for a blocked tool should be a no-op (no stale ID to dequeue)
    await callHook(
      "after_tool_call",
      { toolName: "bash", params: {}, result: undefined, error: "blocked" },
      { toolName: "bash" },
    );
    // No error thrown = no stale ID consumed
  });
});

describe("createPetriGatePlugin — system prompt injection", () => {
  it("does not inject system prompt (structural enforcement only)", () => {
    const { api, hooks } = createMockApi();
    createPetriGatePlugin([simpleNet]).register!(api);

    expect(hooks.has("before_agent_start")).toBe(false);
  });
});

describe("createPetriGatePlugin — commands", () => {
  it("registers net-status command", () => {
    const { api, commands } = createMockApi();
    createPetriGatePlugin([simpleNet]).register!(api);

    expect(commands.has("net-status")).toBe(true);
  });

  it("net-status returns current marking", () => {
    const { api, commands } = createMockApi();
    createPetriGatePlugin([simpleNet]).register!(api);

    const cmd = commands.get("net-status")!;
    const result = cmd.handler({} as any);
    expect(result.text).toContain("simple");
  });

  it("array mode — no add-net/remove-net commands", () => {
    const { api, commands } = createMockApi();
    createPetriGatePlugin([simpleNet]).register!(api);

    expect(commands.has("add-net")).toBe(false);
    expect(commands.has("remove-net")).toBe(false);
  });

  it("registry mode — has add-net/remove-net commands", () => {
    const { api, commands } = createMockApi();
    createPetriGatePlugin({ registry: { simple: simpleNet }, active: ["simple"] }).register!(api);

    expect(commands.has("add-net")).toBe(true);
    expect(commands.has("remove-net")).toBe(true);
  });

  it("add-net activates an inactive net", async () => {
    const { api, commands, callHook } = createMockApi();
    createPetriGatePlugin({ registry: { simple: simpleNet, blocker: blockingNet }, active: ["simple"] }).register!(api);

    // bash allowed with only simple active
    const r1 = await callHook("before_tool_call", { toolName: "bash", params: {} }, { toolName: "bash" });
    expect(r1).toBeUndefined();

    // Add blocker
    const addResult = commands.get("add-net")!.handler({ args: "blocker" } as any);
    expect(addResult.text).toContain("Activated");

    // Now bash is blocked by blocker
    const r2 = await callHook("before_tool_call", { toolName: "bash", params: {} }, { toolName: "bash" });
    expect(r2?.block).toBe(true);
  });

  it("remove-net deactivates an active net", async () => {
    const { api, commands, callHook } = createMockApi();
    createPetriGatePlugin({ registry: { simple: simpleNet, blocker: blockingNet } }).register!(api);

    // bash blocked by blocker
    const r1 = await callHook("before_tool_call", { toolName: "bash", params: {} }, { toolName: "bash" });
    expect(r1?.block).toBe(true);

    // Remove blocker
    const removeResult = commands.get("remove-net")!.handler({ args: "blocker" } as any);
    expect(removeResult.text).toContain("Deactivated");

    // Now bash allowed
    const r2 = await callHook("before_tool_call", { toolName: "bash", params: {} }, { toolName: "bash" });
    expect(r2).toBeUndefined();
  });

  it("add-net without args shows usage", () => {
    const { api, commands } = createMockApi();
    createPetriGatePlugin({ registry: { simple: simpleNet } }).register!(api);

    const result = commands.get("add-net")!.handler({ args: "" } as any);
    expect(result.text).toContain("Usage");
    expect(result.text).toContain("simple");
  });

  it("remove-net without args shows usage", () => {
    const { api, commands } = createMockApi();
    createPetriGatePlugin({ registry: { simple: simpleNet } }).register!(api);

    const result = commands.get("remove-net")!.handler({ args: "" } as any);
    expect(result.text).toContain("Usage");
    expect(result.text).toContain("simple");
  });
});

describe("createPetriGatePlugin — integration with real nets", () => {
  it("toolApprovalNet: free tools pass through", async () => {
    const { api, callHook } = createMockApi();
    createPetriGatePlugin([toolApprovalNet]).register!(api);

    for (const tool of ["ls", "read", "grep", "find"]) {
      const result = await callHook("before_tool_call", { toolName: tool, params: {} }, { toolName: tool });
      expect(result).toBeUndefined();
    }
  });

  it("toolApprovalNet: manual tools blocked (no UI)", async () => {
    const { api, callHook } = createMockApi();
    createPetriGatePlugin([toolApprovalNet]).register!(api);

    const result = await callHook("before_tool_call", { toolName: "write", params: {} }, { toolName: "write" });
    expect(result).toEqual({ block: true, blockReason: expect.stringContaining("requires UI") });
  });
});
