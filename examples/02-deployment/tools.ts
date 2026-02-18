import { $ } from "bun";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const STATE_PATH = join(import.meta.dir, ".deploy-state.json");

type Deployment = { version: string; timestamp: string };
type State = Record<string, Deployment[]>;

async function loadState(): Promise<State> {
  try {
    return JSON.parse(await readFile(STATE_PATH, "utf-8"));
  } catch {
    return {};
  }
}

async function saveState(state: State) {
  await writeFile(STATE_PATH, JSON.stringify(state, null, 2));
}

export const pipeline = {
  async lint() {
    const proc = await $`bun run check`.quiet().nothrow();
    return {
      passed: proc.exitCode === 0,
      output: proc.text().slice(-500),
    };
  },

  async test() {
    const proc = await $`bun test`.quiet().nothrow();
    return {
      passed: proc.exitCode === 0,
      output: proc.text().slice(-500),
    };
  },

  async deploy(environment: string) {
    const state = await loadState();
    const history = state[environment] ?? [];
    const version = `1.${history.length + 1}.0`;
    history.push({ version, timestamp: new Date().toISOString() });
    state[environment] = history;
    await saveState(state);
    return { deployed: true, environment, version };
  },

  async checkStatus(environment: string) {
    const state = await loadState();
    const history = state[environment];
    if (!history?.length) return { environment, status: "not deployed" };
    return { environment, status: "healthy", version: history.at(-1)!.version };
  },

  async rollback(environment: string) {
    const state = await loadState();
    const history = state[environment] ?? [];
    if (history.length < 2) return { rolledBack: false, reason: "no previous version" };
    history.pop();
    state[environment] = history;
    await saveState(state);
    return { rolledBack: true, environment, version: history.at(-1)!.version };
  },
};
