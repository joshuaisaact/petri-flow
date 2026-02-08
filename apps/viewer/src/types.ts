import type { AnalysisResult, PetriNet } from "petri-ts";

export type PlaceCategory = "default" | "terminal" | "human" | "resource";

export type PlaceMetadata = {
  category: PlaceCategory;
  label?: string;
};

export type PropertyProof = {
  name: string;
  holds: boolean;
  description: string;
};

export type ViewerNet = {
  name: string;
  description: string;
  net: PetriNet<string>;
  placeMetadata?: Record<string, PlaceMetadata>;
  invariants?: { weights: Partial<Record<string, number>>; label: string }[];
  deriveProperties?: (analysis: AnalysisResult<string>) => PropertyProof[];
};
