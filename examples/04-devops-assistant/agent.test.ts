import { describe, expect, it } from "bun:test";
import { loadRules } from "@petriflow/rules";
import { createPetriflowGate, ToolCallBlockedError } from "@petriflow/vercel-ai";

const { nets } = await loadRules(
  new URL("./assistant.rules", import.meta.url).pathname,
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

let callId = 0;
function nextId() {
  return `c${++callId}`;
}

describe("04-devops-assistant", () => {
  describe("free tools", () => {
    it("webSearch is always allowed", async () => {
      const gate = createGate();
      const tools = gate.wrapTools({
        webSearch: mockTool(async () => ({ results: [] })),
      });

      const result = await tools.webSearch.execute(
        { query: "node 22" },
        { toolCallId: nextId() },
      );
      expect(result).toEqual({ results: [] });
    });

    it("readInbox is always allowed", async () => {
      const gate = createGate();
      const tools = gate.wrapTools({
        readInbox: mockTool(async () => ({ emails: [] })),
      });

      const result = await tools.readInbox.execute({}, { toolCallId: nextId() });
      expect(result).toEqual({ emails: [] });
    });

    it("listFiles is always allowed", async () => {
      const gate = createGate();
      const tools = gate.wrapTools({
        listFiles: mockTool(async () => ["a.txt"]),
      });

      const result = await tools.listFiles.execute(
        { path: "/tmp" },
        { toolCallId: nextId() },
      );
      expect(result).toEqual(["a.txt"]);
    });

    it("readFile is always allowed", async () => {
      const gate = createGate();
      const tools = gate.wrapTools({
        readFile: mockTool(async () => "contents"),
      });

      const result = await tools.readFile.execute(
        { path: "/tmp/a.txt" },
        { toolCallId: nextId() },
      );
      expect(result).toBe("contents");
    });

    it("checkStatus is always allowed", async () => {
      const gate = createGate();
      const tools = gate.wrapTools({
        checkStatus: mockTool(async () => ({ status: "healthy" })),
      });

      const result = await tools.checkStatus.execute(
        { environment: "production" },
        { toolCallId: nextId() },
      );
      expect(result).toEqual({ status: "healthy" });
    });

    it("slack.readMessages is always allowed", async () => {
      const gate = createGate();
      const tools = gate.wrapTools({
        slack: mockTool(async () => ({ messages: [] })),
      });

      const result = await tools.slack.execute(
        { action: "readMessages", channel: "general" },
        { toolCallId: nextId() },
      );
      expect(result).toEqual({ messages: [] });
    });
  });

  describe("cross-domain independence", () => {
    it("file rules don't affect Slack", async () => {
      const gate = createGate();
      const tools = gate.wrapTools({
        backup: mockTool(async () => "backed-up"),
        delete: mockTool(async () => "deleted"),
        slack: mockTool(async (input: any) => {
          if (input.action === "readMessages") return { messages: [] };
          return { sent: true };
        }),
      });

      // delete is blocked (no backup yet)
      expect(
        tools.delete.execute({}, { toolCallId: nextId() }),
      ).rejects.toThrow(ToolCallBlockedError);

      // but Slack readMessages works fine
      await tools.slack.execute(
        { action: "readMessages", channel: "general" },
        { toolCallId: nextId() },
      );

      // and Slack sendMessage works fine (after read)
      const result = await tools.slack.execute(
        { action: "sendMessage", channel: "general", content: "hello" },
        { toolCallId: nextId() },
      );
      expect(result).toEqual({ sent: true });
    });

    it("Slack rules don't affect deployment", async () => {
      const gate = createGate(async () => true);
      const tools = gate.wrapTools({
        slack: mockTool(async () => ({ messages: [] })),
        lint: mockTool(async () => "passed"),
        test: mockTool(async () => "passed"),
        deploy: mockTool(async () => "deployed"),
      });

      // sendMessage is blocked (no readMessages yet)
      expect(
        tools.slack.execute(
          { action: "sendMessage", channel: "general", content: "hi" },
          { toolCallId: nextId() },
        ),
      ).rejects.toThrow(ToolCallBlockedError);

      // but deployment pipeline works independently
      await tools.lint.execute({}, { toolCallId: nextId() });
      await tools.test.execute({}, { toolCallId: nextId() });
      const result = await tools.deploy.execute(
        { environment: "production" },
        { toolCallId: nextId() },
      );
      expect(result).toBe("deployed");
    });
  });

  describe("Slack: require readMessages before sendMessage", () => {
    it("sendMessage is blocked before readMessages", async () => {
      const gate = createGate();
      const tools = gate.wrapTools({
        slack: mockTool(async () => ({ sent: true })),
      });

      expect(
        tools.slack.execute(
          { action: "sendMessage", channel: "general", content: "hello" },
          { toolCallId: nextId() },
        ),
      ).rejects.toThrow(ToolCallBlockedError);
    });

    it("sendMessage is allowed after readMessages", async () => {
      const gate = createGate();
      const tools = gate.wrapTools({
        slack: mockTool(async (input: any) => {
          if (input.action === "readMessages") return { messages: [] };
          return { sent: true };
        }),
      });

      await tools.slack.execute(
        { action: "readMessages", channel: "general" },
        { toolCallId: nextId() },
      );

      const result = await tools.slack.execute(
        { action: "sendMessage", channel: "general", content: "hello" },
        { toolCallId: nextId() },
      );
      expect(result).toEqual({ sent: true });
    });
  });

  describe("Slack: limit sendMessage to 10 per session", () => {
    it("11th sendMessage is blocked", async () => {
      const gate = createGate();
      const tools = gate.wrapTools({
        slack: mockTool(async (input: any) => {
          if (input.action === "readMessages") return { messages: [] };
          return { sent: true };
        }),
      });

      for (let i = 0; i < 10; i++) {
        await tools.slack.execute(
          { action: "readMessages", channel: "general" },
          { toolCallId: nextId() },
        );
        await tools.slack.execute(
          { action: "sendMessage", channel: "general", content: `msg ${i}` },
          { toolCallId: nextId() },
        );
      }

      // read again to satisfy sequence rule
      await tools.slack.execute(
        { action: "readMessages", channel: "general" },
        { toolCallId: nextId() },
      );

      // 11th send should be blocked by limit
      expect(
        tools.slack.execute(
          { action: "sendMessage", channel: "general", content: "too many" },
          { toolCallId: nextId() },
        ),
      ).rejects.toThrow(ToolCallBlockedError);
    });
  });

  describe("Email: require human-approval before sendEmail", () => {
    it("sendEmail is blocked without confirm callback", async () => {
      const gate = createGate();
      const tools = gate.wrapTools({
        sendEmail: mockTool(async () => ({ sent: true })),
      });

      expect(
        tools.sendEmail.execute(
          { to: "manager@company.com", subject: "Update", body: "Done" },
          { toolCallId: nextId() },
        ),
      ).rejects.toThrow(ToolCallBlockedError);
    });

    it("sendEmail is blocked when human rejects", async () => {
      const gate = createGate(async () => false);
      const tools = gate.wrapTools({
        sendEmail: mockTool(async () => ({ sent: true })),
      });

      expect(
        tools.sendEmail.execute(
          { to: "manager@company.com", subject: "Update", body: "Done" },
          { toolCallId: nextId() },
        ),
      ).rejects.toThrow(ToolCallBlockedError);
    });

    it("sendEmail is allowed when human approves", async () => {
      const gate = createGate(async () => true);
      const tools = gate.wrapTools({
        sendEmail: mockTool(async () => ({ sent: true })),
      });

      const result = await tools.sendEmail.execute(
        { to: "manager@company.com", subject: "Update", body: "Done" },
        { toolCallId: nextId() },
      );
      expect(result).toEqual({ sent: true });
    });
  });

  describe("Email: limit sendEmail to 3 per session", () => {
    it("4th sendEmail is blocked", async () => {
      const gate = createGate(async () => true);
      const tools = gate.wrapTools({
        sendEmail: mockTool(async () => ({ sent: true })),
      });

      for (let i = 0; i < 3; i++) {
        await tools.sendEmail.execute(
          { to: `user${i}@company.com`, subject: "Update", body: "Done" },
          { toolCallId: nextId() },
        );
      }

      expect(
        tools.sendEmail.execute(
          { to: "extra@company.com", subject: "Update", body: "Done" },
          { toolCallId: nextId() },
        ),
      ).rejects.toThrow(ToolCallBlockedError);
    });
  });

  describe("Deployment: require lint → test → deploy + approval", () => {
    it("deploy is blocked before lint and test", async () => {
      const gate = createGate(async () => true);
      const tools = gate.wrapTools({
        lint: mockTool(async () => "passed"),
        test: mockTool(async () => "passed"),
        deploy: mockTool(async () => "deployed"),
      });

      expect(
        tools.deploy.execute(
          { environment: "production" },
          { toolCallId: nextId() },
        ),
      ).rejects.toThrow(ToolCallBlockedError);
    });

    it("deploy is blocked after lint but before test", async () => {
      const gate = createGate(async () => true);
      const tools = gate.wrapTools({
        lint: mockTool(async () => "passed"),
        test: mockTool(async () => "passed"),
        deploy: mockTool(async () => "deployed"),
      });

      await tools.lint.execute({}, { toolCallId: nextId() });

      expect(
        tools.deploy.execute(
          { environment: "production" },
          { toolCallId: nextId() },
        ),
      ).rejects.toThrow(ToolCallBlockedError);
    });

    it("deploy is allowed after lint → test + approval", async () => {
      const gate = createGate(async () => true);
      const tools = gate.wrapTools({
        lint: mockTool(async () => "passed"),
        test: mockTool(async () => "passed"),
        deploy: mockTool(async () => "deployed"),
      });

      await tools.lint.execute({}, { toolCallId: nextId() });
      await tools.test.execute({}, { toolCallId: nextId() });
      const result = await tools.deploy.execute(
        { environment: "production" },
        { toolCallId: nextId() },
      );
      expect(result).toBe("deployed");
    });
  });

  describe("Deployment: limit deploy to 2 per session", () => {
    it("3rd deploy is blocked", async () => {
      const gate = createGate(async () => true);
      const tools = gate.wrapTools({
        lint: mockTool(async () => "passed"),
        test: mockTool(async () => "passed"),
        deploy: mockTool(async () => "deployed"),
      });

      // deploy 1
      await tools.lint.execute({}, { toolCallId: nextId() });
      await tools.test.execute({}, { toolCallId: nextId() });
      await tools.deploy.execute(
        { environment: "production" },
        { toolCallId: nextId() },
      );

      // deploy 2
      await tools.lint.execute({}, { toolCallId: nextId() });
      await tools.test.execute({}, { toolCallId: nextId() });
      await tools.deploy.execute(
        { environment: "staging" },
        { toolCallId: nextId() },
      );

      // deploy 3 (blocked by limit)
      await tools.lint.execute({}, { toolCallId: nextId() });
      await tools.test.execute({}, { toolCallId: nextId() });

      expect(
        tools.deploy.execute(
          { environment: "production" },
          { toolCallId: nextId() },
        ),
      ).rejects.toThrow(ToolCallBlockedError);
    });
  });

  describe("Files: require backup before delete", () => {
    it("delete is blocked before backup", async () => {
      const gate = createGate();
      const tools = gate.wrapTools({
        backup: mockTool(async () => "backed-up"),
        delete: mockTool(async () => "deleted"),
      });

      expect(
        tools.delete.execute({ path: "/tmp/temp.log" }, { toolCallId: nextId() }),
      ).rejects.toThrow(ToolCallBlockedError);
    });

    it("delete is allowed after backup", async () => {
      const gate = createGate();
      const tools = gate.wrapTools({
        backup: mockTool(async () => "backed-up"),
        delete: mockTool(async () => "deleted"),
      });

      await tools.backup.execute(
        { path: "/tmp/temp.log" },
        { toolCallId: nextId() },
      );
      const result = await tools.delete.execute(
        { path: "/tmp/temp.log" },
        { toolCallId: nextId() },
      );
      expect(result).toBe("deleted");
    });
  });

  describe("Files: block rm", () => {
    it("rm is permanently blocked", async () => {
      const gate = createGate();
      const tools = gate.wrapTools({ rm: mockTool() });

      expect(
        tools.rm.execute({ path: "/tmp/temp.log" }, { toolCallId: nextId() }),
      ).rejects.toThrow(ToolCallBlockedError);
    });
  });

  describe("cross-domain interleaving", () => {
    it("backup → slack.readMessages → delete → slack.sendMessage all succeed", async () => {
      const gate = createGate();
      const tools = gate.wrapTools({
        backup: mockTool(async () => "backed-up"),
        delete: mockTool(async () => "deleted"),
        slack: mockTool(async (input: any) => {
          if (input.action === "readMessages") return { messages: [] };
          return { sent: true };
        }),
      });

      // backup earns delete token
      await tools.backup.execute(
        { path: "/tmp/temp.log" },
        { toolCallId: nextId() },
      );

      // slack.readMessages earns send token (different domain)
      await tools.slack.execute(
        { action: "readMessages", channel: "general" },
        { toolCallId: nextId() },
      );

      // delete works (backup was done, Slack state irrelevant)
      const deleteResult = await tools.delete.execute(
        { path: "/tmp/temp.log" },
        { toolCallId: nextId() },
      );
      expect(deleteResult).toBe("deleted");

      // slack.sendMessage works (readMessages was done, file state irrelevant)
      const sendResult = await tools.slack.execute(
        { action: "sendMessage", channel: "general", content: "cleaned up" },
        { toolCallId: nextId() },
      );
      expect(sendResult).toEqual({ sent: true });
    });
  });
});
