import { describe, expect, it } from "bun:test";
import {
  backupBeforeDelete,
  observeBeforeSend,
  testBeforeDeploy,
  researchBeforeShare,
} from "../presets.js";
import { createGateManager } from "@petriflow/gate";
import type { GateToolCall, GateContext } from "@petriflow/gate";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let callIdCounter = 0;
function makeEvent(
  toolName: string,
  input: Record<string, unknown> = {},
): GateToolCall {
  return {
    toolCallId: `call-${++callIdCounter}`,
    toolName,
    input,
  };
}

function makeCtx(): GateContext {
  return { hasUI: true, confirm: async () => true };
}

// ---------------------------------------------------------------------------
// Preset structure tests
// ---------------------------------------------------------------------------

describe("backupBeforeDelete", () => {
  it("returns a valid SkillNet with expected name", () => {
    const net = backupBeforeDelete();
    expect(net.name).toBe("cleanup");
    expect(net.places).toBeDefined();
    expect(net.transitions.length).toBeGreaterThan(0);
  });

  it("has free tools including read and ls", () => {
    const net = backupBeforeDelete();
    expect(net.freeTools).toContain("read");
    expect(net.freeTools).toContain("ls");
  });

  it("free tool is allowed via GateManager", async () => {
    const manager = createGateManager([backupBeforeDelete()], {
      mode: "enforce",
    });
    const result = await manager.handleToolCall(makeEvent("read"), makeCtx());
    expect(result).toBeUndefined();
  });

  it("destructive tool is blocked without prior backup", async () => {
    const manager = createGateManager([backupBeforeDelete()], {
      mode: "enforce",
    });
    const result = await manager.handleToolCall(
      makeEvent("bash", { command: "rm -rf build/" }),
      makeCtx(),
    );
    expect(result).toEqual({
      block: true,
      reason: expect.stringContaining("cleanup"),
    });
  });
});

describe("observeBeforeSend", () => {
  it("returns a valid SkillNet with expected name", () => {
    const net = observeBeforeSend();
    expect(net.name).toBe("communicate");
    expect(net.transitions.length).toBeGreaterThan(0);
  });

  it("has free tools including read", () => {
    const net = observeBeforeSend();
    expect(net.freeTools).toContain("read");
  });
});

describe("testBeforeDeploy", () => {
  it("returns a valid SkillNet with expected name", () => {
    const net = testBeforeDeploy();
    expect(net.name).toBe("deploy");
    expect(net.transitions.length).toBeGreaterThan(0);
  });

  it("has free tools including bash", () => {
    const net = testBeforeDeploy();
    expect(net.freeTools).toContain("bash");
  });
});

describe("researchBeforeShare", () => {
  it("returns a valid SkillNet with expected name", () => {
    const net = researchBeforeShare();
    expect(net.name).toBe("research");
    expect(net.transitions.length).toBeGreaterThan(0);
  });

  it("has free tools including read", () => {
    const net = researchBeforeShare();
    expect(net.freeTools).toContain("read");
  });
});
