import { $ } from "bun";
import * as fs from "node:fs/promises";
import { join } from "node:path";

// --- Web search (Brave Search API) ---

export const web = {
  async search(query: string) {
    const res = await fetch(
      `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=5`,
      { headers: { "X-Subscription-Token": process.env.BRAVE_API_KEY! } },
    );
    if (!res.ok) throw new Error(`Brave API ${res.status}: ${await res.text()}`);
    const data: any = await res.json();
    return {
      results: (data.web?.results ?? []).map((r: any) => ({
        title: r.title,
        snippet: r.description,
        url: r.url,
      })),
    };
  },
};

// --- Slack (Web API) ---

const slackChannelCache = new Map<string, string>();

async function slackApi(method: string, body?: Record<string, unknown>) {
  const res = await fetch(`https://slack.com/api/${method}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data: any = await res.json();
  if (!data.ok) throw new Error(`Slack API ${method}: ${data.error}`);
  return data;
}

async function resolveSlackChannel(name: string): Promise<string> {
  const cached = slackChannelCache.get(name);
  if (cached) return cached;
  const data = await slackApi("conversations.list", { types: "public_channel,private_channel", limit: 200 });
  const channel = data.channels.find((c: any) => c.name === name);
  if (!channel) throw new Error(`Slack channel #${name} not found`);
  slackChannelCache.set(name, channel.id);
  return channel.id;
}

export const slack = {
  async readMessages(channel: string) {
    const id = await resolveSlackChannel(channel);
    const data = await slackApi("conversations.history", { channel: id, limit: 10 });
    return {
      messages: data.messages.map((m: any) => ({
        author: m.user,
        content: m.text,
        ts: m.ts,
      })),
    };
  },

  async sendMessage(channel: string, content: string) {
    const id = await resolveSlackChannel(channel);
    const data = await slackApi("chat.postMessage", { channel: id, text: content });
    return { sent: true, channel, ts: data.ts };
  },
};

// --- Email (Gmail API for reading, Resend API for sending) ---

export const email = {
  async readInbox() {
    const token = process.env.GMAIL_ACCESS_TOKEN;
    const res = await fetch(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=5",
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!res.ok) throw new Error(`Gmail API ${res.status}: ${await res.text()}`);
    const { messages = [] }: any = await res.json();

    const emails = await Promise.all(
      messages.map(async (m: any) => {
        const msg: any = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
          { headers: { Authorization: `Bearer ${token}` } },
        ).then((r) => r.json());
        const headers: any[] = msg.payload?.headers ?? [];
        const get = (name: string) => headers.find((h) => h.name === name)?.value;
        return { from: get("From"), subject: get("Subject"), date: get("Date") };
      }),
    );
    return { emails };
  },

  async send(to: string, subject: string, body: string) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM ?? "devops@example.com",
        to,
        subject,
        text: body,
      }),
    });
    if (!res.ok) throw new Error(`Resend API ${res.status}: ${await res.text()}`);
    const data: any = await res.json();
    return { sent: true, id: data.id };
  },
};

// --- Deployment pipeline (shell commands + file state) ---

const DEPLOY_STATE = join(import.meta.dir, ".deploy-state.json");

type Deployment = { version: string; timestamp: string };
type DeployState = Record<string, Deployment[]>;

async function loadDeployState(): Promise<DeployState> {
  try {
    return JSON.parse(await fs.readFile(DEPLOY_STATE, "utf-8"));
  } catch {
    return {};
  }
}

async function saveDeployState(state: DeployState) {
  await fs.writeFile(DEPLOY_STATE, JSON.stringify(state, null, 2));
}

export const pipeline = {
  async lint() {
    const proc = await $`bun run check`.quiet().nothrow();
    return { passed: proc.exitCode === 0, output: proc.text().slice(-500) };
  },

  async test() {
    const proc = await $`bun test`.quiet().nothrow();
    return { passed: proc.exitCode === 0, output: proc.text().slice(-500) };
  },

  async deploy(environment: string) {
    const state = await loadDeployState();
    const history = state[environment] ?? [];
    const version = `2.${history.length + 1}.0`;
    history.push({ version, timestamp: new Date().toISOString() });
    state[environment] = history;
    await saveDeployState(state);
    return { deployed: true, environment, version };
  },

  async checkStatus(environment: string) {
    const state = await loadDeployState();
    const history = state[environment];
    if (!history?.length) return { environment, status: "not deployed" };
    return { environment, status: "healthy", version: history.at(-1)!.version };
  },
};

// --- File operations ---

export const files = {
  async list(path: string) {
    const entries = await fs.readdir(path);
    return { files: entries };
  },

  async read(path: string) {
    const content = await fs.readFile(path, "utf-8");
    return { content };
  },

  async backup(path: string) {
    const dest = `${path}.bak`;
    await fs.copyFile(path, dest);
    return { backedUp: dest };
  },

  async remove(path: string) {
    await fs.unlink(path);
    return { deleted: path };
  },

  async forceRemove(path: string) {
    await fs.rm(path, { force: true });
    return { removed: path };
  },
};
