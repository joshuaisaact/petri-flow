export interface NodeExecutor {
  validate(config: Record<string, unknown>): void;
  execute(params: {
    ctx: Record<string, unknown>;
    marking: Record<string, number>;
    config: Record<string, unknown>;
    transitionName: string;
  }): Promise<Record<string, unknown>>;
}

/** Default timeout for httpNode fetch requests (30 seconds). */
const HTTP_TIMEOUT_MS = 30_000;

export function isPrivateHost(hostname: string): boolean {
  // Block loopback
  if (hostname === "localhost") return true;

  // Block IPv6 private/reserved
  // Strip brackets if present (Bun keeps them, Node strips them)
  const lower = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (lower === "::1" || lower === "::") return true;
  // IPv4-mapped IPv6: ::ffff:127.0.0.1 or ::ffff:7f00:1
  if (lower.startsWith("::ffff:")) return true;
  // Unique local (fc00::/7) — starts with fc or fd
  if (/^f[cd]/.test(lower) && lower.includes(":")) return true;
  // Link-local (fe80::/10)
  if (lower.startsWith("fe80")) return true;

  // Block private IPv4 ranges
  const parts = hostname.split(".");
  if (parts.length === 4 && parts.every((p) => /^\d+$/.test(p))) {
    const a = Number(parts[0]);
    const b = Number(parts[1]);
    if (a === 127) return true;                            // 127.0.0.0/8
    if (a === 10) return true;                             // 10.0.0.0/8
    if (a === 172 && b >= 16 && b <= 31) return true;      // 172.16.0.0/12
    if (a === 192 && b === 168) return true;                // 192.168.0.0/16
    if (a === 169 && b === 254) return true;                // 169.254.0.0/16 (link-local)
    if (a === 100 && b >= 64 && b <= 127) return true;     // 100.64.0.0/10 (CGNAT)
    if (a === 0) return true;                              // 0.0.0.0/8
  }
  return false;
}

export const httpNode: NodeExecutor = {
  validate(config) {
    if (typeof config.url !== "string") {
      throw new Error("httpNode requires a string 'url' in config");
    }
  },

  async execute({ config, transitionName }) {
    const url = config.url as string;
    const parsed = new URL(url);
    if (isPrivateHost(parsed.hostname)) {
      throw new Error(`httpNode blocked request to private/internal host: ${parsed.hostname}`);
    }
    const method = (config.method as string) ?? "GET";
    const headers = (config.headers as Record<string, string>) ?? {};
    const body = config.body !== undefined ? JSON.stringify(config.body) : undefined;

    const res = await fetch(url, {
      method,
      headers,
      body,
      redirect: "error",
      signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
    });
    const contentType = res.headers.get("content-type") ?? "";
    const data: unknown = contentType.includes("application/json")
      ? await res.json()
      : await res.text();

    return {
      [transitionName]: { status: res.status, ok: res.ok, data },
    };
  },
};

export const timerNode: NodeExecutor = {
  validate(config) {
    if (typeof config.delayMs !== "number" || config.delayMs < 0) {
      throw new Error("timerNode requires a non-negative number 'delayMs' in config");
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
