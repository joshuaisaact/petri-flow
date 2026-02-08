import { useRef, useState } from "react";
import { canFire, fire } from "petri-ts";
import type { Marking, Transition } from "petri-ts";
import type { ViewerNet } from "../types";

export type FiringRecord = {
  step: number;
  transition: string;
};

export function usePetriNet(viewerNet: ViewerNet) {
  const { net } = viewerNet;
  const [marking, setMarking] = useState<Marking<string>>(net.initialMarking);
  const [history, setHistory] = useState<FiringRecord[]>([]);
  const [lastFired, setLastFired] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(null);

  const enabled = net.transitions.filter((t) => canFire(marking, t));
  const isTerminal = enabled.length === 0;

  function fireTransition(name: string) {
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

  function reset() {
    setMarking(net.initialMarking);
    setHistory([]);
    setLastFired(null);
  }

  return { marking, enabled, isTerminal, history, lastFired, fireTransition, reset };
}
