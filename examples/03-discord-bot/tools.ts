const TOKEN = process.env.DISCORD_BOT_TOKEN!;
const GUILD_ID = process.env.DISCORD_GUILD_ID!;
const BASE = "https://discord.com/api/v10";

async function api(path: string, options?: RequestInit) {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bot ${TOKEN}`,
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });
  if (!res.ok) throw new Error(`Discord API ${res.status}: ${await res.text()}`);
  return res.json();
}

const channelCache = new Map<string, string>();

async function resolveChannel(name: string): Promise<string> {
  const cached = channelCache.get(name);
  if (cached) return cached;
  const channels: any[] = await api(`/guilds/${GUILD_ID}/channels`);
  const channel = channels.find((c) => c.name === name);
  if (!channel) throw new Error(`Channel #${name} not found`);
  channelCache.set(name, channel.id);
  return channel.id;
}

export const discord = {
  async readMessages(channel: string) {
    const id = await resolveChannel(channel);
    const messages: any[] = await api(`/channels/${id}/messages?limit=10`);
    return {
      messages: messages.map((m) => ({
        id: m.id,
        author: m.author.username,
        content: m.content,
      })),
    };
  },

  async sendMessage(channel: string, content: string) {
    const id = await resolveChannel(channel);
    const msg = await api(`/channels/${id}/messages`, {
      method: "POST",
      body: JSON.stringify({ content }),
    });
    return { sent: true, id: msg.id };
  },

  async addReaction(channel: string, messageId: string, emoji: string) {
    const id = await resolveChannel(channel);
    await fetch(
      `${BASE}/channels/${id}/messages/${messageId}/reactions/${encodeURIComponent(emoji)}/@me`,
      { method: "PUT", headers: { Authorization: `Bot ${TOKEN}` } },
    );
    return { reacted: true, messageId, emoji };
  },

  async createThread(channel: string, threadName: string) {
    const id = await resolveChannel(channel);
    const thread = await api(`/channels/${id}/threads`, {
      method: "POST",
      body: JSON.stringify({ name: threadName, type: 11 }),
    });
    return { created: true, threadName: thread.name, id: thread.id };
  },
};
