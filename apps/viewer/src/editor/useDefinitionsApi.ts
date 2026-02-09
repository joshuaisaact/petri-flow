import { useEffect, useState } from "react";
import type { SerializedDefinition } from "@petriflow/engine";

export function useDefinitionsApi() {
  const [names, setNames] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  async function refresh() {
    try {
      const res = await fetch("/definitions");
      if (res.ok) setNames(await res.json());
    } catch {
      // server not reachable
    }
  }

  useEffect(() => { refresh(); }, []);

  async function load(name: string): Promise<SerializedDefinition | null> {
    try {
      const res = await fetch(`/definitions/${encodeURIComponent(name)}`);
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }

  async function save(def: SerializedDefinition): Promise<{ ok: boolean; error?: string }> {
    setLoading(true);
    try {
      const res = await fetch(`/definitions/${encodeURIComponent(def.name)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(def),
      });
      const data = await res.json();
      if (!res.ok) return { ok: false, error: data.error ?? "Save failed" };
      await refresh();
      return { ok: true };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    } finally {
      setLoading(false);
    }
  }

  async function remove(name: string): Promise<boolean> {
    try {
      const res = await fetch(`/definitions/${encodeURIComponent(name)}`, { method: "DELETE" });
      if (res.ok) await refresh();
      return res.ok;
    } catch {
      return false;
    }
  }

  return { names, loading, refresh, load, save, remove };
}
