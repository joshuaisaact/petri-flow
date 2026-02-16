import { describe, expect, it } from "bun:test";
import { loadRules } from "@petriflow/rules";
import { createPetriflowGate, ToolCallBlockedError } from "@petriflow/vercel-ai";

const { nets } = await loadRules(
  new URL("./safety.rules", import.meta.url).pathname,
);

function mockTool(fn?: (...args: any[]) => any) {
  return {
    description: "test tool",
    parameters: { type: "object" as const, properties: {} },
    execute: fn ?? (async () => ({ ok: true })),
  };
}

function createGate() {
  return createPetriflowGate(nets);
}

describe("01-file-management", () => {
  describe("free tools", () => {
    it("listFiles is always allowed", async () => {
      const gate = createGate();
      const tools = gate.wrapTools({ listFiles: mockTool(async () => ["a.txt"]) });

      const result = await tools.listFiles.execute({}, { toolCallId: "c1" });
      expect(result).toEqual(["a.txt"]);
    });

    it("readFile is always allowed", async () => {
      const gate = createGate();
      const tools = gate.wrapTools({ readFile: mockTool(async () => "contents") });

      const result = await tools.readFile.execute({}, { toolCallId: "c1" });
      expect(result).toBe("contents");
    });
  });

  describe("block rm", () => {
    it("rm is permanently blocked", async () => {
      const gate = createGate();
      const tools = gate.wrapTools({ rm: mockTool() });

      expect(tools.rm.execute({}, { toolCallId: "c1" })).rejects.toThrow(
        ToolCallBlockedError,
      );
    });
  });

  describe("require backup before delete", () => {
    it("delete is blocked before backup", async () => {
      const gate = createGate();
      const tools = gate.wrapTools({
        backup: mockTool(async () => "backed-up"),
        delete: mockTool(async () => "deleted"),
      });

      expect(
        tools.delete.execute({}, { toolCallId: "c1" }),
      ).rejects.toThrow(ToolCallBlockedError);
    });

    it("delete is allowed after backup succeeds", async () => {
      const gate = createGate();
      const tools = gate.wrapTools({
        backup: mockTool(async () => "backed-up"),
        delete: mockTool(async () => "deleted"),
      });

      await tools.backup.execute({}, { toolCallId: "c1" });
      const result = await tools.delete.execute({}, { toolCallId: "c2" });
      expect(result).toBe("deleted");
    });

    it("backup failure does not unlock delete", async () => {
      const gate = createGate();
      const tools = gate.wrapTools({
        backup: mockTool(async () => {
          throw new Error("backup failed");
        }),
        delete: mockTool(async () => "deleted"),
      });

      try {
        await tools.backup.execute({}, { toolCallId: "c1" });
      } catch {}

      expect(
        tools.delete.execute({}, { toolCallId: "c2" }),
      ).rejects.toThrow(ToolCallBlockedError);
    });

    it("backup → delete cycle is repeatable", async () => {
      const gate = createGate();
      const tools = gate.wrapTools({
        backup: mockTool(async () => "backed-up"),
        delete: mockTool(async () => "deleted"),
      });

      await tools.backup.execute({}, { toolCallId: "c1" });
      await tools.delete.execute({}, { toolCallId: "c2" });

      // second cycle
      expect(
        tools.delete.execute({}, { toolCallId: "c3" }),
      ).rejects.toThrow(ToolCallBlockedError);

      await tools.backup.execute({}, { toolCallId: "c4" });
      const result = await tools.delete.execute({}, { toolCallId: "c5" });
      expect(result).toBe("deleted");
    });
  });
});
