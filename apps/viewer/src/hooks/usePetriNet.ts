import { useRef, useState } from "react";
import { canFire, fire } from "petri-ts";
import type { Marking } from "petri-ts";
import { enabledWorkflowTransitions, fireWorkflow } from "@petriflow/engine";
import type { ViewerNet } from "../types";

export type FiringRecord = {
  step: number;
  transition: string;
  durationMs?: number;
  error?: string;
  contextDiff?: string[];
};

export type PetriNetMode = "simulate" | "execute";

export function usePetriNet(viewerNet: ViewerNet, mode: PetriNetMode) {
  const { net, definition } = viewerNet;
  const [marking, setMarking] = useState<Marking<string>>(net.initialMarking);
  const [context, setContext] = useState<Record<string, unknown>>(
    () => definition?.initialContext ?? {},
  );
  const [history, setHistory] = useState<FiringRecord[]>([]);
  const [lastFired, setLastFired] = useState<string | null>(null);
  const [firing, setFiring] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(null);

  const enabled =
    mode === "execute" && definition
      ? enabledWorkflowTransitions(
          definition.net as any,
          marking as any,
          context as any,
          definition.guards as any,
        )
      : net.transitions.filter((t) => canFire(marking, t));

  async function fireTransition(name: string) {
    if (firing) return;

    if (mode === "execute" && definition) {
      const transition = definition.net.transitions.find(
        (t) => t.name === name,
      );
      if (!transition) return;

      setFiring(name);
      const start = performance.now();
      try {
        const result = await fireWorkflow(
          marking as any,
          transition as any,
          context as any,
          definition.guards as any,
          definition.executors as any,
        );
        const durationMs = Math.round(performance.now() - start);
        const prevKeys = new Set(Object.keys(context));
        const contextDiff = Object.keys(result.context as Record<string, unknown>).filter(
          (k) =>
            !prevKeys.has(k) ||
            (context as any)[k] !== (result.context as any)[k],
        );
        setMarking(result.marking as Marking<string>);
        setContext(result.context as Record<string, unknown>);
        setHistory((prev) => [
          ...prev,
          {
            step: prev.length + 1,
            transition: name,
            durationMs,
            contextDiff: contextDiff.length > 0 ? contextDiff : undefined,
          },
        ]);
        setLastFired(name);
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => setLastFired(null), 500);
      } catch (err) {
        const durationMs = Math.round(performance.now() - start);
        setHistory((prev) => [
          ...prev,
          {
            step: prev.length + 1,
            transition: name,
            durationMs,
            error: err instanceof Error ? err.message : String(err),
          },
        ]);
      } finally {
        setFiring(null);
      }
    } else {
      const transition = net.transitions.find((t) => t.name === name);
      if (!transition || !canFire(marking, transition)) return;
      const next = fire(marking, transition);
      setMarking(next);
      setHistory((prev) => [
        ...prev,
        { step: prev.length + 1, transition: name },
      ]);
      setLastFired(name);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setLastFired(null), 500);
    }
  }

  function reset() {
    setMarking(net.initialMarking);
    setContext(definition?.initialContext ?? {});
    setHistory([]);
    setLastFired(null);
    setFiring(null);
  }

  return {
    marking,
    enabled,
    isTerminal: enabled.length === 0,
    history,
    lastFired,
    firing,
    context,
    fireTransition,
    reset,
  };
}
