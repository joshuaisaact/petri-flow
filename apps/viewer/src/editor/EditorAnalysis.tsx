import { useMemo } from "react";
import type { SerializedDefinition } from "@petriflow/engine";
import { defineWorkflow } from "@petriflow/engine/workflow";
import { analyse } from "@petriflow/engine/analyse";
import { StateSpace } from "../components/panel/StateSpace";
import { SafetyProperties } from "../components/panel/SafetyProperties";
import { TransitionBehavior } from "../components/panel/TransitionBehavior";
import { useTheme } from "../theme";

type Props = {
  definition: SerializedDefinition;
};

export function EditorAnalysis({ definition }: Props) {
  const { t } = useTheme();

  const analysis = useMemo(() => {
    // Need at least one place and one transition to analyse
    if (definition.places.length === 0) return null;
    try {
      const wfDef = defineWorkflow({
        name: definition.name,
        places: definition.places,
        transitions: definition.transitions.map((t) => ({
          name: t.name,
          inputs: t.inputs as typeof definition.places,
          outputs: t.outputs as typeof definition.places,
          guard: t.guard,
          timeout: t.timeout as any,
        })),
        initialMarking: definition.initialMarking as any,
        initialContext: definition.initialContext as any,
        terminalPlaces: definition.terminalPlaces as typeof definition.places,
        invariants: definition.invariants as any,
      });
      const result = analyse(wfDef);
      return { result, definition: wfDef };
    } catch {
      return null;
    }
  }, [definition]);

  if (!analysis) {
    return (
      <div className={`rounded-lg border p-3 ${t("bg-slate-900 border-slate-800", "bg-white border-slate-200")}`}>
        <h3 className={`text-xs font-semibold uppercase tracking-wider mb-2 ${t("text-slate-400", "text-slate-500")}`}>
          Analysis
        </h3>
        <p className={`text-xs ${t("text-slate-600", "text-slate-400")}`}>
          Add places and transitions to see analysis.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className={`rounded-lg border p-3 ${t("bg-slate-900 border-slate-800", "bg-white border-slate-200")}`}>
        <StateSpace result={analysis.result} />
      </div>
      <div className={`rounded-lg border p-3 ${t("bg-slate-900 border-slate-800", "bg-white border-slate-200")}`}>
        <SafetyProperties
          properties={[]}
          invariants={definition.invariants?.map((inv) => ({ weights: inv.weights, label: Object.entries(inv.weights).map(([p, w]) => `${w}*${p}`).join(" + ") }))}
          analysisInvariants={analysis.result.invariants}
        />
      </div>
      <div className={`rounded-lg border p-3 ${t("bg-slate-900 border-slate-800", "bg-white border-slate-200")}`}>
        <TransitionBehavior definition={analysis.definition} />
      </div>
    </div>
  );
}
