import type { ExperimentFactors, FactorOverride } from "./types";

export type ColumnScanUIState = {
  status: "idle" | "loading" | "error" | "ready";
  includeCommentColumns: boolean;
  selectedColumns: string[];
  suggestedColumns: string[];
  columnRoles: Record<string, "condition" | "comment" | "unknown">;
  factorCandidates: string[];
  notes?: string;
  uncertainties?: string[];
  error?: string | null;
};

export type FactorExtractionState = {
  status: "idle" | "loading" | "error" | "ready";
  experiments: ExperimentFactors[];
  overrides: Record<string, Record<string, FactorOverride | undefined>>;
  error?: string | null;
};
