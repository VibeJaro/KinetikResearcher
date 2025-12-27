export type ColumnSummary = {
  name: string;
  typeHeuristic: "text" | "number";
  nonNullRatio: number;
  examples: Array<string | number>;
};

export type ColumnScanRequest = {
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

export type FactorValue = string | number | null;

export type FactorProvenance = {
  column: string;
  rawValueSnippet: string;
};

export type ExtractedFactor = {
  name: string;
  value: FactorValue;
  confidence: "low" | "medium" | "high";
  provenance: FactorProvenance[];
};

export type ExperimentFactors = {
  experimentId: string;
  factors: ExtractedFactor[];
  warnings?: string[];
};

export type FactorExtractionRequest = {
  factorCandidates: FactorCandidate[];
  selectedColumns: string[];
  experiments: Array<{
    experimentId: string;
    meta: Record<string, FactorValue>;
  }>;
};

export type FactorExtractionResponse = {
  experiments: ExperimentFactors[];
};

export type FactorOverride = {
  value: FactorValue;
  rationale?: string;
};

export type GroupingRecipe = {
  recipeId: string;
  description: string;
  factors: string[];
  groups: GroupingGroup[];
};

export type GroupingGroup = {
  groupId: string;
  name: string;
  signature: Record<string, FactorValue>;
  experimentIds: string[];
  warnings?: string[];
};

export type FinalGroup = {
  groupId: string;
  name: string;
  signature: Record<string, FactorValue>;
  experimentIds: string[];
  createdFromRecipe: string | null;
};
