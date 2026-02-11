import { useEffect, useRef } from "react";
import type { FiringRecord } from "../../hooks/usePetriNet";
import { useTheme } from "../../theme";
import { Disclosure } from "../Disclosure";

type Props = {
  history: FiringRecord[];
};

export function FiringHistory({ history }: Props) {
  const listRef = useRef<HTMLDivElement>(null);
  const { t } = useTheme();

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [history.length]);

  return (
    <Disclosure label="History">
      {history.length === 0 ? (
        <p className={`text-sm ${t("text-slate-500", "text-slate-400")}`}>Click a transition to fire it</p>
      ) : (
        <div ref={listRef} className="max-h-48 overflow-y-auto space-y-0.5 text-sm scrollbar-thin">
          {history.map((record) => (
            <div key={record.step} className="flex flex-col gap-0.5">
              <div className="flex gap-2 items-baseline">
                <span className={`font-mono w-6 text-right shrink-0 ${t("text-slate-500", "text-slate-400")}`}>
                  {record.step}.
                </span>
                <span className={record.error ? "text-red-400" : t("text-slate-300", "text-slate-600")}>
                  {record.transition}
                </span>
                {record.durationMs != null && (
                  <span className={`ml-auto text-[11px] font-mono ${t("text-slate-600", "text-slate-400")}`}>
                    {record.durationMs}ms
                  </span>
                )}
              </div>
              {record.error && (
                <span className="ml-8 text-[11px] text-red-400 break-all">{record.error}</span>
              )}
              {record.contextDiff && record.contextDiff.length > 0 && (
                <div className="ml-8 flex flex-wrap gap-1">
                  {record.contextDiff.map((key) => (
                    <span key={key} className="px-1 py-0.5 rounded text-[10px] font-mono bg-emerald-500/20 text-emerald-400">
                      +{key}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </Disclosure>
  );
}
