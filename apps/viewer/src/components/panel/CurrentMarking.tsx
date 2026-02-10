import type { Marking } from "petri-ts";
import type { PlaceMetadata } from "../../types";
import { useTheme } from "../../theme";
import { Disclosure } from "../Disclosure";

const dotColor: Record<string, string> = {
  default: "bg-slate-400",
  terminal: "bg-emerald-400",
  human: "bg-amber-400",
  resource: "bg-violet-400",
};

type Props = {
  marking: Marking<string>;
  placeMetadata?: Record<string, PlaceMetadata>;
};

export function CurrentMarking({ marking, placeMetadata }: Props) {
  const { t } = useTheme();
  const active = Object.entries(marking)
    .filter(([, count]) => count > 0)
    .sort(([, a], [, b]) => b - a);

  return (
    <Disclosure label="Current State">
      {active.length === 0 ? (
        <p className={`text-sm ${t("text-slate-500", "text-slate-400")}`}>No tokens</p>
      ) : (
        <div className="space-y-1.5">
          {active.map(([place, count]) => {
            const cat = placeMetadata?.[place]?.category ?? "default";
            return (
              <div
                key={place}
                className="flex items-center gap-2 text-sm"
              >
                <span className={`w-2 h-2 rounded-full shrink-0 ${dotColor[cat] ?? dotColor["default"]}`} />
                <span className={`flex-1 truncate ${t("text-slate-300", "text-slate-600")}`}>
                  {placeMetadata?.[place]?.label ?? place}
                </span>
                <span className={`font-mono font-semibold tabular-nums ${t("text-white", "text-slate-900")}`}>
                  {count}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </Disclosure>
  );
}
