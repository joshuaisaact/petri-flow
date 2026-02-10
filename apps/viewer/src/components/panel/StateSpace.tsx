import type { WorkflowAnalysisResult } from "../../hooks/useAnalysis";
import { useTheme } from "../../theme";
import { Disclosure } from "../Disclosure";

type Props = {
  result: WorkflowAnalysisResult<string>;
};

export function StateSpace({ result }: Props) {
  const { t } = useTheme();
  const deadlockFree = result.unexpectedTerminalStates.length === 0;

  return (
    <Disclosure label="State Space">
      <div className="space-y-1 text-sm">
        <div className="flex justify-between">
          <span className={t("text-slate-400", "text-slate-500")}>Reachable states</span>
          <span className={`font-mono ${t("text-slate-200", "text-slate-700")}`}>
            {result.reachableStateCount}
          </span>
        </div>
        <div className="flex justify-between">
          <span className={t("text-slate-400", "text-slate-500")}>Terminal states</span>
          <span className={`font-mono ${t("text-slate-200", "text-slate-700")}`}>
            {result.terminalStates.length}
          </span>
        </div>
        <div className="flex justify-between">
          <span className={t("text-slate-400", "text-slate-500")}>Deadlock-free</span>
          <span className={deadlockFree ? "text-emerald-400" : "text-red-400"}>
            {deadlockFree ? "Yes" : "No"}
          </span>
        </div>
      </div>
    </Disclosure>
  );
}
