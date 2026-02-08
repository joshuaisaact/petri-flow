import { useEffect, useRef, useState } from "react";
import type { Transition } from "petri-ts";

export function useAutoPlay(
  enabled: Transition<string>[],
  isTerminal: boolean,
  fireTransition: (name: string) => void,
) {
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(500);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (!playing || isTerminal) {
      if (isTerminal) setPlaying(false);
      return;
    }

    intervalRef.current = setInterval(() => {
      if (enabled.length === 0) {
        setPlaying(false);
        return;
      }
      const idx = Math.floor(Math.random() * enabled.length);
      fireTransition(enabled[idx]!.name);
    }, speed);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [playing, speed, isTerminal, enabled, fireTransition]);

  return { playing, setPlaying, speed, setSpeed };
}
