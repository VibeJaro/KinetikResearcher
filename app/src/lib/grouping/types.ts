export type ColumnSummary = {
  name: string;
  typeHeuristic: "text" | "numeric" | "mixed";
  nonNullRatio: number;
  examples: Array<string | number>;
};

export type ColumnScanRequest = {
  columns: ColumnSummary[];
  experimentCount: number;
  knownStructuralColumns: string[];
};

export type ColumnScanResult = {
  selectedColumns: string[];
  columnRoles: Record<string, "condition" | "comment" | "unknown">;
  factorCandidates: string[];
  notes?: string;
  uncertainties?: string[];
};

export type ProvenanceSnippet = {
  column: string;
  rawValueSnippet: string;
};

export type FactorValue = {
  name: string;
  value: string | number | null;
  confidence: "low" | "medium" | "high";
  provenance: ProvenanceSnippet[];
};

export type FactorExtractionExperiment = {
  experimentId: string;
  factors: FactorValue[];
  warnings?: string[];
};

export type FactorExtractionRequest = {
  factorCandidates: string[];
  selectedColumns: string[];
  experiments: Array<{
    experimentId: string;
    meta: Record<string, string | number | null>;
  }>;
};

export type FactorExtractionResponse = {
  experiments: FactorExtractionExperiment[];
};

export type FactorOverride = {
  value: string | number | null;
  note?: string;
};

export type ResolvedFactor = FactorValue & {
  override?: FactorOverride;
};

export type FactorTable = Record<string, ResolvedFactor[]>; // experimentId -> factors

export type GroupingOption = {
  recipeId: string;
  description: string;
  factorsUsed: string[];
  groups: Array<{
    groupId: string;
    signature: Record<string, string | number | null>;
    experimentIds: string[];
    warningFactors?: string[];
  }>;
  warnings?: string[];
};

export type ManualGroup = {
  groupId: string;
  name: string;
  experimentIds: string[];
  signature: Record<string, string | number | null>;
  createdFromRecipe?: string;
  warningFactors?: string[];
};
