import type { Marking } from "petri-ts";
import type { FiringRecord } from "../../hooks/usePetriNet";
import type { PropertyProof, ViewerNet } from "../../types";
import type { WorkflowAnalysisResult } from "../../hooks/useAnalysis";
import { CurrentMarking } from "./CurrentMarking";
import { FiringHistory } from "./FiringHistory";
import { StateSpace } from "./StateSpace";
import { SafetyProperties } from "./SafetyProperties";
import { TransitionBehavior } from "./TransitionBehavior";
import { useTheme } from "../../theme";

type Props = {
  viewerNet: ViewerNet;
  marking: Marking<string>;
  history: FiringRecord[];
  isTerminal: boolean;
  result: WorkflowAnalysisResult<string>;
  properties: PropertyProof[];
};

export function AnalysisPanel({
  viewerNet,
  marking,
  history,
  isTerminal,
  result,
  properties,
}: Props) {
  const { t } = useTheme();

  return (
    <div
      className={`w-80 border-l p-4 flex flex-col gap-4 overflow-y-auto ${t(
        "bg-slate-950 border-slate-800",
        "bg-slate-50 border-slate-200",
      )}`}
    >
      <div>
        <h2 className={`text-sm font-bold ${t("text-white", "text-slate-900")}`}>
          {viewerNet.name}
        </h2>
        <p className={`text-xs mt-1 leading-relaxed ${t("text-slate-500", "text-slate-500")}`}>
          {viewerNet.description}
        </p>
      </div>
      {isTerminal && (
        <div className="bg-emerald-950 border border-emerald-800 rounded-lg px-3 py-2 text-sm text-emerald-400 font-medium">
          Terminal state reached
        </div>
      )}
      <div className={`rounded-lg border p-3 ${t("bg-slate-900 border-slate-800", "bg-white border-slate-200")}`}>
        <CurrentMarking marking={marking} placeMetadata={viewerNet.placeMetadata} />
      </div>
      <div className={`rounded-lg border p-3 ${t("bg-slate-900 border-slate-800", "bg-white border-slate-200")}`}>
        <FiringHistory history={history} />
      </div>
      <div className={`rounded-lg border p-3 ${t("bg-slate-900 border-slate-800", "bg-white border-slate-200")}`}>
        <StateSpace result={result} />
      </div>
      <div className={`rounded-lg border p-3 ${t("bg-slate-900 border-slate-800", "bg-white border-slate-200")}`}>
        <SafetyProperties
          properties={properties}
          invariants={viewerNet.invariants}
          analysisInvariants={result.invariants}
        />
      </div>
      {viewerNet.definition && (
        <div className={`rounded-lg border p-3 ${t("bg-slate-900 border-slate-800", "bg-white border-slate-200")}`}>
          <TransitionBehavior definition={viewerNet.definition} />
        </div>
      )}
    </div>
  );
}
