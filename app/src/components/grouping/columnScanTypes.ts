export type ColumnRole = "condition" | "comment" | "noise";

export type ColumnSummary = {
  name: string;
  typeHeuristic: "numeric" | "text" | "mixed";
  nonNullRatio: number;
  examples?: string[];
};

export type ColumnScanPayload = {
  columns: ColumnSummary[];
  experimentCount?: number | null;
  knownStructuralColumns?: string[];
};

export type ColumnScanResult = {
  selectedColumns: string[];
  columnRoles: Record<string, ColumnRole>;
  factorCandidates: string[];
  notes: string;
  uncertainties: string[];
};
