import { useEffect, useRef, useState } from "react";
import type { Transition } from "petri-ts";

export function useAutoPlay(
  enabled: Transition<string>[],
  isTerminal: boolean,
  fireTransition: (name: string) => void | Promise<void>,
  firing: string | null,
) {
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(500);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    if (!playing || isTerminal || firing) {
      if (isTerminal) setPlaying(false);
      return;
    }

    if (enabled.length === 0) {
      setPlaying(false);
      return;
    }

    timeoutRef.current = setTimeout(async () => {
      const idx = Math.floor(Math.random() * enabled.length);
      await fireTransition(enabled[idx]!.name);
    }, speed);

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [playing, speed, isTerminal, enabled, fireTransition, firing]);

  return { playing, setPlaying, speed, setSpeed };
}
