import { useMemo } from "react";
import { analyse, type WorkflowAnalysisResult } from "@petriflow/engine/analyse";
import type { PropertyProof, ViewerNet } from "../types";

export type { WorkflowAnalysisResult };

export function useAnalysis(viewerNet: ViewerNet) {
  const result: WorkflowAnalysisResult<string> = useMemo(() => {
    // Derive terminal places from placeMetadata
    const terminalPlaces = Object.entries(viewerNet.placeMetadata ?? {})
      .filter(([, meta]) => meta.category === "terminal")
      .map(([place]) => place);

    return analyse(
      {
        name: viewerNet.name,
        net: viewerNet.net,
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
