import type { AnalysisResult } from "petri-ts";
import type { PropertyProof, ViewerNet } from "../../types";
import { useTheme } from "../../theme";
import { Disclosure } from "../Disclosure";

type Props = {
  properties: PropertyProof[];
  invariants: ViewerNet["invariants"];
  analysisInvariants: AnalysisResult<string>["invariants"];
};

export function SafetyProperties({
  properties,
  invariants,
  analysisInvariants,
}: Props) {
  const { t } = useTheme();

  return (
    <Disclosure label="Safety Properties">
      <div className="space-y-2">
        {properties.map((prop) => (
          <div key={prop.name} className="text-sm">
            <div className="flex items-center gap-1.5">
              <span className={prop.holds ? "text-emerald-400" : "text-red-400"}>
                {prop.holds ? "\u2713" : "\u2717"}
              </span>
              <span className={`font-medium ${t("text-slate-200", "text-slate-700")}`}>{prop.name}</span>
            </div>
            <p className={`text-xs ml-5 ${t("text-slate-500", "text-slate-400")}`}>{prop.description}</p>
          </div>
        ))}
        {invariants?.map((inv, i) => {
          const result = analysisInvariants[i];
          return (
            <div key={inv.label} className="text-sm">
              <div className="flex items-center gap-1.5">
                <span className={result?.holds ? "text-emerald-400" : "text-red-400"}>
                  {result?.holds ? "\u2713" : "\u2717"}
                </span>
                <span className={`font-medium ${t("text-slate-200", "text-slate-700")}`}>Invariant</span>
              </div>
              <p className={`text-xs ml-5 ${t("text-slate-500", "text-slate-400")}`}>{inv.label}</p>
            </div>
          );
        })}
      </div>
    </Disclosure>
  );
}
