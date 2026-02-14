import { describe, test, expect } from "bun:test";
import {
  cleanupNet,
  extractBackupTarget,
  extractDestructiveTarget,
  pathCovers,
} from "../nets/cleanup.js";
import {
  handleToolCall,
  handleToolResult,
  createGateState,
  autoAdvance,
} from "@petriflow/gate";

// -----------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------

type Place = "idle" | "ready" | "backedUp";

function gs() {
  return createGateState<Place>(autoAdvance(cleanupNet, { ...cleanupNet.initialMarking }));
}

const noCtx = { hasUI: false } as any;

function bash(command: string, toolCallId = "tc-1") {
  return { toolCallId, toolName: "bash", input: { command } } as any;
}

function bashResult(toolCallId: string, isError: boolean) {
  return { toolCallId, toolName: "bash", input: { command: "" }, isError } as any;
}

function bashResultWithCmd(toolCallId: string, command: string, isError: boolean) {
  return { toolCallId, toolName: "bash", input: { command }, isError } as any;
}

// -----------------------------------------------------------------------
// Path extraction
// -----------------------------------------------------------------------

describe("extractBackupTarget", () => {
  test("git stash → '.'", () => expect(extractBackupTarget("git stash")).toBe("."));
  test("cp -r src/ /tmp/bak → 'src'", () => expect(extractBackupTarget("cp -r src/ /tmp/bak")).toBe("src"));
  test("pg_dump → 'database'", () => expect(extractBackupTarget("pg_dump mydb > dump.sql")).toBe("database"));
  test("non-backup → null", () => expect(extractBackupTarget("echo hello")).toBeNull());
});

describe("extractDestructiveTarget", () => {
  test("rm -rf build/ → 'build'", () => expect(extractDestructiveTarget("rm -rf build/")).toBe("build"));
  test("git reset --hard → '.'", () => expect(extractDestructiveTarget("git reset --hard")).toBe("."));
  test("DROP TABLE → 'database'", () => expect(extractDestructiveTarget("DROP TABLE users")).toBe("database"));
  test("non-destructive → null", () => expect(extractDestructiveTarget("ls -la")).toBeNull());
});

describe("pathCovers", () => {
  test("'.' covers everything", () => expect(pathCovers(".", "src/generated")).toBe(true));
  test("exact match", () => expect(pathCovers("build", "build")).toBe(true));
  test("parent covers child", () => expect(pathCovers("src", "src/generated")).toBe(true));
  test("unrelated paths don't cover", () => expect(pathCovers("src", "build")).toBe(false));
  test("database matches database", () => expect(pathCovers("database", "database")).toBe(true));
});

// -----------------------------------------------------------------------
// Net behavior
// -----------------------------------------------------------------------

describe("cleanupNet", () => {
  test("auto-advances from idle to ready", () => {
    const state = gs();
    expect(state.marking.ready).toBe(1);
    expect(state.marking.idle).toBe(0);
  });

  test("regular bash is free", async () => {
    const state = gs();
    const result = await handleToolCall(bash("echo hello"), noCtx, cleanupNet, state);
    expect(result).toBeUndefined();
  });

  test("destructive bash blocked without backup", async () => {
    const state = gs();
    const result = await handleToolCall(bash("rm -rf build/"), noCtx, cleanupNet, state);
    expect(result?.block).toBe(true);
  });

  test("backup is deferred — allowed but fires on result", async () => {
    const state = gs();
    const result = await handleToolCall(bash("cp -r src/ /tmp/src-bak", "tc-bak"), noCtx, cleanupNet, state);
    expect(result).toBeUndefined();
    expect(state.marking.ready).toBe(1); // hasn't fired yet
    expect(state.pending.size).toBe(1);
  });

  test("backup fires on success → backedUp state", async () => {
    const state = gs();
    await handleToolCall(bash("cp -r src/ /tmp/src-bak", "tc-bak"), noCtx, cleanupNet, state);
    handleToolResult(
      bashResultWithCmd("tc-bak", "cp -r src/ /tmp/src-bak", false),
      cleanupNet,
      state,
    );
    expect(state.marking.backedUp).toBe(1);
    expect(state.marking.ready).toBe(0);
  });

  test("failed backup doesn't advance", async () => {
    const state = gs();
    await handleToolCall(bash("cp -r src/ /tmp/src-bak", "tc-bak"), noCtx, cleanupNet, state);
    handleToolResult(bashResult("tc-bak", true), cleanupNet, state);
    expect(state.marking.ready).toBe(1);
    expect(state.marking.backedUp).toBe(0);
  });

  test("full cycle: backup → destroy → back to ready", async () => {
    const state = gs();

    // Backup
    await handleToolCall(bash("git stash", "tc-bak"), noCtx, cleanupNet, state);
    handleToolResult(
      bashResultWithCmd("tc-bak", "git stash", false),
      cleanupNet,
      state,
    );

    // Destroy
    const result = await handleToolCall(bash("rm -rf build/", "tc-rm"), noCtx, cleanupNet, state);
    expect(result).toBeUndefined();
    expect(state.marking.ready).toBe(1);
  });

  test("path mismatch: backup src/ then rm build/ → blocked", async () => {
    const state = gs();

    // Backup src/
    await handleToolCall(bash("cp -r src/ /tmp/src-bak", "tc-bak"), noCtx, cleanupNet, state);
    handleToolResult(
      bashResultWithCmd("tc-bak", "cp -r src/ /tmp/src-bak", false),
      cleanupNet,
      state,
    );

    // Try rm build/
    const result = await handleToolCall(bash("rm -rf build/"), noCtx, cleanupNet, state);
    expect(result?.block).toBe(true);
    expect(result?.reason).toContain("build");
  });

  test("git stash covers any destructive target", async () => {
    const state = gs();

    await handleToolCall(bash("git stash", "tc-bak"), noCtx, cleanupNet, state);
    handleToolResult(
      bashResultWithCmd("tc-bak", "git stash", false),
      cleanupNet,
      state,
    );

    const result = await handleToolCall(bash("rm -rf anything/"), noCtx, cleanupNet, state);
    expect(result).toBeUndefined();
  });

  test("each destroy consumes its backup", async () => {
    const state = gs();

    // Backup + destroy cycle 1
    await handleToolCall(bash("git stash", "tc-b1"), noCtx, cleanupNet, state);
    handleToolResult(bashResultWithCmd("tc-b1", "git stash", false), cleanupNet, state);
    await handleToolCall(bash("rm -rf build/", "tc-d1"), noCtx, cleanupNet, state);

    // Second destroy without backup → blocked
    const result = await handleToolCall(bash("rm -rf dist/", "tc-d2"), noCtx, cleanupNet, state);
    expect(result?.block).toBe(true);
  });
});
