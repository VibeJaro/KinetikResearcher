export type ColumnProfile = {
  name: string;
  typeHeuristic: "numeric" | "text" | "mixed";
  nonNullRatio: number;
  examples: string[];
};

export type ColumnScanStructuralSummary = {
  time: string | null;
  values: string[];
  experiment: string | null;
  replicate: string | null;
};

export type ColumnScanPayload = {
  columns: ColumnProfile[];
  experimentCount: number | null;
  knownStructuralColumns: string[];
  structuralSummary: ColumnScanStructuralSummary;
};

export type ColumnScanResult = {
  selectedColumns: string[];
  columnRoles: Record<string, "condition" | "comment" | "noise">;
  factorCandidates: string[];
  notes: string;
  uncertainties: string[];
};
