import { useEffect, useRef } from "react";
import type { FiringRecord } from "../../hooks/usePetriNet";
import { useTheme } from "../../theme";
import { Disclosure } from "../Disclosure";

type Props = {
  history: FiringRecord[];
};

export function FiringHistory({ history }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const { t } = useTheme();

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [history.length]);

  return (
    <Disclosure label="History">
      {history.length === 0 ? (
        <p className={`text-sm ${t("text-slate-500", "text-slate-400")}`}>Click a transition to fire it</p>
      ) : (
        <div className="max-h-48 overflow-y-auto space-y-0.5 text-sm scrollbar-thin">
          {history.map((record) => (
            <div key={record.step} className="flex gap-2">
              <span className={`font-mono w-6 text-right shrink-0 ${t("text-slate-500", "text-slate-400")}`}>
                {record.step}.
              </span>
              <span className={t("text-slate-300", "text-slate-600")}>{record.transition}</span>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      )}
    </Disclosure>
  );
}
