import { describe, expect, it } from "bun:test";
import { loadRules } from "@petriflow/rules";
import { createPetriflowGate, ToolCallBlockedError } from "@petriflow/vercel-ai";

const { nets } = await loadRules(
  new URL("./pipeline.rules", import.meta.url).pathname,
);

function mockTool(fn?: (...args: any[]) => any) {
  return {
    description: "test tool",
    parameters: { type: "object" as const, properties: {} },
    execute: fn ?? (async () => ({ ok: true })),
  };
}

function createGate(confirm?: (title: string, message: string) => Promise<boolean>) {
  return createPetriflowGate(nets, { confirm });
}

describe("02-deployment", () => {
  describe("free tools", () => {
    it("checkStatus is always allowed", async () => {
      const gate = createGate();
      const tools = gate.wrapTools({
        checkStatus: mockTool(async () => ({ status: "healthy" })),
      });

      const result = await tools.checkStatus.execute({}, { toolCallId: "c1" });
      expect(result).toEqual({ status: "healthy" });
    });

    it("rollback is always allowed", async () => {
      const gate = createGate();
      const tools = gate.wrapTools({
        rollback: mockTool(async () => ({ rolledBack: true })),
      });

      const result = await tools.rollback.execute({}, { toolCallId: "c1" });
      expect(result).toEqual({ rolledBack: true });
    });
  });

  describe("require lint before test", () => {
    it("test is blocked before lint", async () => {
      const gate = createGate();
      const tools = gate.wrapTools({
        lint: mockTool(async () => "passed"),
        test: mockTool(async () => "passed"),
      });

      expect(tools.test.execute({}, { toolCallId: "c1" })).rejects.toThrow(
        ToolCallBlockedError,
      );
    });

    it("test is allowed after lint succeeds", async () => {
      const gate = createGate();
      const tools = gate.wrapTools({
        lint: mockTool(async () => "passed"),
        test: mockTool(async () => "42 passed"),
      });

      await tools.lint.execute({}, { toolCallId: "c1" });
      const result = await tools.test.execute({}, { toolCallId: "c2" });
      expect(result).toBe("42 passed");
    });
  });

  describe("require test before deploy", () => {
    it("deploy is blocked before test", async () => {
      const gate = createGate(async () => true);
      const tools = gate.wrapTools({
        lint: mockTool(async () => "passed"),
        test: mockTool(async () => "passed"),
        deploy: mockTool(async () => "deployed"),
      });

      // lint passes, but test hasn't run
      await tools.lint.execute({}, { toolCallId: "c1" });

      expect(
        tools.deploy.execute({}, { toolCallId: "c2" }),
      ).rejects.toThrow(ToolCallBlockedError);
    });

    it("deploy is allowed after lint → test pipeline", async () => {
      const gate = createGate(async () => true);
      const tools = gate.wrapTools({
        lint: mockTool(async () => "passed"),
        test: mockTool(async () => "passed"),
        deploy: mockTool(async () => "deployed"),
      });

      await tools.lint.execute({}, { toolCallId: "c1" });
      await tools.test.execute({}, { toolCallId: "c2" });
      const result = await tools.deploy.execute({}, { toolCallId: "c3" });
      expect(result).toBe("deployed");
    });
  });

  describe("require human-approval before deploy", () => {
    it("deploy is blocked without confirm callback", async () => {
      const gate = createGate();
      const tools = gate.wrapTools({
        lint: mockTool(async () => "passed"),
        test: mockTool(async () => "passed"),
        deploy: mockTool(async () => "deployed"),
      });

      await tools.lint.execute({}, { toolCallId: "c1" });
      await tools.test.execute({}, { toolCallId: "c2" });

      expect(
        tools.deploy.execute({}, { toolCallId: "c3" }),
      ).rejects.toThrow(ToolCallBlockedError);
    });

    it("deploy is blocked when human rejects", async () => {
      const gate = createGate(async () => false);
      const tools = gate.wrapTools({
        lint: mockTool(async () => "passed"),
        test: mockTool(async () => "passed"),
        deploy: mockTool(async () => "deployed"),
      });

      await tools.lint.execute({}, { toolCallId: "c1" });
      await tools.test.execute({}, { toolCallId: "c2" });

      expect(
        tools.deploy.execute({}, { toolCallId: "c3" }),
      ).rejects.toThrow(ToolCallBlockedError);
    });

    it("deploy is allowed when human approves", async () => {
      const gate = createGate(async () => true);
      const tools = gate.wrapTools({
        lint: mockTool(async () => "passed"),
        test: mockTool(async () => "passed"),
        deploy: mockTool(async () => "deployed"),
      });

      await tools.lint.execute({}, { toolCallId: "c1" });
      await tools.test.execute({}, { toolCallId: "c2" });
      const result = await tools.deploy.execute({}, { toolCallId: "c3" });
      expect(result).toBe("deployed");
    });
  });

  describe("limit deploy to 2 per session", () => {
    it("3rd deploy is blocked", async () => {
      const gate = createGate(async () => true);
      const tools = gate.wrapTools({
        lint: mockTool(async () => "passed"),
        test: mockTool(async () => "passed"),
        deploy: mockTool(async () => "deployed"),
      });

      // deploy 1: lint → test → deploy
      await tools.lint.execute({}, { toolCallId: "c1" });
      await tools.test.execute({}, { toolCallId: "c2" });
      await tools.deploy.execute({}, { toolCallId: "c3" });

      // deploy 2: lint → test → deploy
      await tools.lint.execute({}, { toolCallId: "c4" });
      await tools.test.execute({}, { toolCallId: "c5" });
      await tools.deploy.execute({}, { toolCallId: "c6" });

      // deploy 3: lint → test → deploy (blocked by limit)
      await tools.lint.execute({}, { toolCallId: "c7" });
      await tools.test.execute({}, { toolCallId: "c8" });

      expect(
        tools.deploy.execute({}, { toolCallId: "c9" }),
      ).rejects.toThrow(ToolCallBlockedError);
    });
  });
});
