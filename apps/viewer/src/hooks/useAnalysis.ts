import { useMemo } from "react";
import { analyse, type WorkflowAnalysisResult } from "@petriflow/engine/analyse";
import type { PropertyProof, ViewerNet } from "../types";

export type { WorkflowAnalysisResult };

export function useAnalysis(viewerNet: ViewerNet) {
  const result: WorkflowAnalysisResult<string> = useMemo(() => {
    if (viewerNet.definition) {
      // Use real definition directly — has terminalPlaces + invariants from source
      return analyse(viewerNet.definition, {
        invariants: viewerNet.invariants?.map((inv) => ({
          weights: inv.weights,
        })),
      });
    }

    // Fallback: derive terminal places from placeMetadata for viewer-only nets
    const terminalPlaces = Object.entries(viewerNet.placeMetadata ?? {})
      .filter(([, meta]) => meta.category === "terminal")
      .map(([place]) => place);

    return analyse(
      {
        name: viewerNet.name,
        net: {
          transitions: viewerNet.net.transitions.map((t) => ({
            ...t,
            type: "automatic",
            guard: null as string | null,
          })),
          initialMarking: viewerNet.net.initialMarking,
        },
        guards: new Map(),
        executors: new Map(),
        initialContext: {},
        terminalPlaces,
        invariants: viewerNet.invariants?.map((inv) => ({
          weights: inv.weights,
        })),
      },
    );
  }, [viewerNet]);

  const properties: PropertyProof[] = viewerNet.deriveProperties?.(result) ?? [];

  return { result, properties };
}
