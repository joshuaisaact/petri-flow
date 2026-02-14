import { existsSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import type { GateManager } from "@petriflow/gate";

type PersistedPending = {
  toolCallId: string;
  transitionName: string;
  resolvedTool: string;
};

type PersistedNetState = {
  marking: Record<string, number>;
  meta: Record<string, unknown>;
  pending: PersistedPending[];
};

type PersistedState = {
  nets: Record<string, PersistedNetState>;
};

function statePath(sessionId: string): string {
  return `/tmp/petriflow-claude-code-${sessionId}.json`;
}

/** Extract state from manager and write to disk. */
export function saveState(sessionId: string, manager: GateManager): void {
  const persisted: PersistedState = { nets: {} };

  for (const { name, state } of manager.getActiveNets()) {
    const pendingArr: PersistedPending[] = [];
    for (const [, entry] of state.pending) {
      pendingArr.push({
        toolCallId: entry.toolCallId,
        transitionName: entry.transition.name,
        resolvedTool: entry.resolvedTool,
      });
    }
    persisted.nets[name] = {
      marking: { ...state.marking },
      meta: { ...state.meta },
      pending: pendingArr,
    };
  }

  writeFileSync(statePath(sessionId), JSON.stringify(persisted));
}

/** Restore state from disk into an existing manager's active nets. */
export function restoreState(sessionId: string, manager: GateManager): void {
  const path = statePath(sessionId);
  if (!existsSync(path)) return;

  const persisted: PersistedState = JSON.parse(readFileSync(path, "utf-8"));

  for (const { name, net, state } of manager.getActiveNets()) {
    const saved = persisted.nets[name];
    if (!saved) continue;

    // Restore marking — overwrite each place
    for (const [place, tokens] of Object.entries(saved.marking)) {
      (state.marking as Record<string, number>)[place] = tokens;
    }

    // Restore meta
    for (const [key, value] of Object.entries(saved.meta)) {
      state.meta[key] = value;
    }

    // Restore pending — re-link transition objects from the net
    state.pending.clear();
    for (const entry of saved.pending) {
      const transition = net.transitions.find((t) => t.name === entry.transitionName);
      if (transition) {
        state.pending.set(entry.toolCallId, {
          toolCallId: entry.toolCallId,
          transition,
          resolvedTool: entry.resolvedTool,
        });
      }
    }
  }
}

/** Delete state file for a session. */
export function clearState(sessionId: string): void {
  const path = statePath(sessionId);
  if (existsSync(path)) {
    unlinkSync(path);
  }
}
