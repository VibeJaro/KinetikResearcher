import type { MetadataValue } from "../import/types";

export type ColumnSummary = {
  name: string;
  typeHeuristic: "text" | "number" | "mixed";
  nonNullRatio: number;
  examples: MetadataValue[];
};

export type ColumnScanPayload = {
  columns: ColumnSummary[];
  experimentCount: number;
  knownStructuralColumns: string[];
};

export type ColumnScanResponse = {
  selectedColumns: string[];
  columnRoles: Record<string, "condition" | "comment" | "unknown">;
  factorCandidates: string[];
  notes?: string;
  uncertainties?: string[];
};

export type FactorCandidate = string;

export type FactorProvenance = {
  column: string;
  rawValueSnippet: string;
};

export type FactorExtractionRequestExperiment = {
  experimentId: string;
  meta: Record<string, MetadataValue>;
};

export type FactorExtractionPayload = {
  factorCandidates: FactorCandidate[];
  selectedColumns: string[];
  experiments: FactorExtractionRequestExperiment[];
};

export type FactorValue = {
  name: string;
  value: MetadataValue;
  confidence: "low" | "medium" | "high";
  provenance: FactorProvenance[];
};

export type FactorizedExperiment = {
  experimentId: string;
  factors: FactorValue[];
  warnings?: string[];
};

export type FactorExtractionResponse = {
  experiments: FactorizedExperiment[];
};

export type FactorOverride = {
  value: string;
  reason?: string;
  updatedAt: string;
};

export type FactorOverrideMap = Record<string, Record<string, FactorOverride>>;

export type GroupDefinition = {
  groupId: string;
  name: string;
  experimentIds: string[];
  signature: Record<string, MetadataValue>;
  createdFromRecipe: string | null;
  warnings?: string[];
};

export type GroupingOption = {
  recipeId: string;
  description: string;
  groups: GroupDefinition[];
  factorsUsed: string[];
};

export type GroupingState = {
  columnScan: ColumnScanResponse | null;
  selectedColumns: string[];
  includeComments: boolean;
  factorCandidates: FactorCandidate[];
  factors: FactorizedExperiment[];
  overrides: FactorOverrideMap;
  groupingOptions: GroupingOption[];
  selectedOptionId: string | null;
  groups: GroupDefinition[];
  manualGroupsDirty: boolean;
};
