import type { Marking } from "petri-ts";

export interface NodeExecutor {
  validate(config: Record<string, unknown>): void;
  execute(params: {
    ctx: Record<string, unknown>;
    marking: Record<string, number>;
    config: Record<string, unknown>;
    transitionName: string;
  }): Promise<Record<string, unknown>>;
}

export const httpNode: NodeExecutor = {
  validate(config) {
    if (typeof config.url !== "string") {
      throw new Error("httpNode requires a string 'url' in config");
    }
  },

  async execute({ config, transitionName }) {
    const url = config.url as string;
    const method = (config.method as string) ?? "GET";
    const headers = (config.headers as Record<string, string>) ?? {};
    const body = config.body !== undefined ? JSON.stringify(config.body) : undefined;

    const res = await fetch(url, { method, headers, body });
    const contentType = res.headers.get("content-type") ?? "";
    const data = contentType.includes("application/json")
      ? await res.json()
      : await res.text();

    return {
      [transitionName]: { status: res.status, ok: res.ok, data },
    };
  },
};

export const timerNode: NodeExecutor = {
  validate(config) {
    if (typeof config.delayMs !== "number") {
      throw new Error("timerNode requires a number 'delayMs' in config");
    }
  },

  async execute({ config, transitionName }) {
    const delayMs = config.delayMs as number;
    if (delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    return {
      [transitionName]: { delayed: true, delayMs },
    };
  },
};

export function defaultNodes(): Map<string, NodeExecutor> {
  return new Map([
    ["http", httpNode],
    ["timer", timerNode],
  ]);
}
