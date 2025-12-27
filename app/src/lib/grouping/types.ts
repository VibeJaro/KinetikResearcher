export type ColumnSummary = {
  name: string;
  typeHeuristic: "text" | "numeric";
  nonNullRatio: number;
  examples: (string | number)[];
};

export type ColumnScanResult = {
  selectedColumns: string[];
  columnRoles: Record<string, string>;
  factorCandidates: string[];
  notes?: string;
  uncertainties?: string[];
};

export type FactorConfidence = "low" | "medium" | "high";

export type FactorProvenance = {
  column: string;
  rawValueSnippet: string;
};

export type ExtractedFactor = {
  name: string;
  value: string | number | null;
  confidence: FactorConfidence;
  provenance: FactorProvenance[];
};

export type FactorExtractionExperiment = {
  experimentId: string;
  factors: ExtractedFactor[];
  warnings?: string[];
};

export type FactorExtractionResult = {
  experiments: FactorExtractionExperiment[];
  factorNames: string[];
  factorCandidates: string[];
  selectedColumns: string[];
};

export type GroupingRecipeGroup = {
  groupId: string;
  signature: Record<string, string | number | null>;
  experimentIds: string[];
  warning?: string | null;
  name?: string;
  createdFromRecipe?: string | null;
};

export type GroupingRecipe = {
  recipeId: string;
  description: string;
  groups: GroupingRecipeGroup[];
};

export type FactorOverrides = Record<string, Record<string, string | number | null>>;
