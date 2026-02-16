import { describe, expect, it } from "bun:test";
import { loadRules } from "@petriflow/rules";
import { createPetriflowGate, ToolCallBlockedError } from "@petriflow/vercel-ai";

const { nets } = await loadRules(
  new URL("./messaging.rules", import.meta.url).pathname,
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

let callId = 0;
function nextId() {
  return `c${++callId}`;
}

describe("03-discord-bot", () => {
  describe("free actions", () => {
    it("discord.readMessages is always allowed", async () => {
      const gate = createGate();
      const tools = gate.wrapTools({
        discord: mockTool(async () => ({ messages: [] })),
      });

      const result = await tools.discord.execute(
        { action: "readMessages", channel: "general" },
        { toolCallId: nextId() },
      );
      expect(result).toEqual({ messages: [] });
    });

    it("discord.addReaction is always allowed", async () => {
      const gate = createGate();
      const tools = gate.wrapTools({
        discord: mockTool(async () => ({ reacted: true })),
      });

      const result = await tools.discord.execute(
        { action: "addReaction", channel: "general", messageId: "1", emoji: "👍" },
        { toolCallId: nextId() },
      );
      expect(result).toEqual({ reacted: true });
    });

    it("discord.createThread is always allowed", async () => {
      const gate = createGate();
      const tools = gate.wrapTools({
        discord: mockTool(async () => ({ created: true })),
      });

      const result = await tools.discord.execute(
        { action: "createThread", channel: "general", threadName: "test" },
        { toolCallId: nextId() },
      );
      expect(result).toEqual({ created: true });
    });
  });

  describe("require readMessages before sendMessage", () => {
    it("sendMessage is blocked before readMessages", async () => {
      const gate = createGate();
      const tools = gate.wrapTools({
        discord: mockTool(async () => ({ sent: true })),
      });

      expect(
        tools.discord.execute(
          { action: "sendMessage", channel: "general", content: "hello" },
          { toolCallId: nextId() },
        ),
      ).rejects.toThrow(ToolCallBlockedError);
    });

    it("sendMessage is allowed after readMessages", async () => {
      const gate = createGate();
      const tools = gate.wrapTools({
        discord: mockTool(async (input: any) => {
          if (input.action === "readMessages") return { messages: [] };
          return { sent: true };
        }),
      });

      await tools.discord.execute(
        { action: "readMessages", channel: "general" },
        { toolCallId: nextId() },
      );

      const result = await tools.discord.execute(
        { action: "sendMessage", channel: "general", content: "hello" },
        { toolCallId: nextId() },
      );
      expect(result).toEqual({ sent: true });
    });
  });

  describe("limit sendMessage to 5 per session", () => {
    it("6th sendMessage is blocked", async () => {
      const gate = createGate();
      const tools = gate.wrapTools({
        discord: mockTool(async (input: any) => {
          if (input.action === "readMessages") return { messages: [] };
          return { sent: true };
        }),
      });

      for (let i = 0; i < 5; i++) {
        // readMessages → sendMessage cycle (sequence rule requires read before each send)
        await tools.discord.execute(
          { action: "readMessages", channel: "general" },
          { toolCallId: nextId() },
        );
        await tools.discord.execute(
          { action: "sendMessage", channel: "general", content: `msg ${i}` },
          { toolCallId: nextId() },
        );
      }

      // read again to satisfy sequence rule
      await tools.discord.execute(
        { action: "readMessages", channel: "general" },
        { toolCallId: nextId() },
      );

      // 6th send should be blocked by limit
      expect(
        tools.discord.execute(
          { action: "sendMessage", channel: "general", content: "too many" },
          { toolCallId: nextId() },
        ),
      ).rejects.toThrow(ToolCallBlockedError);
    });
  });
});
