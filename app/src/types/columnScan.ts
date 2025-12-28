export type ColumnTypeHeuristic = "numeric" | "text" | "mixed";

export type ColumnSummary = {
  name: string;
  typeHeuristic: ColumnTypeHeuristic;
  nonNullRatio: number;
  examples?: string[];
};

export type ColumnScanRequest = {
  columns: ColumnSummary[];
  experimentCount?: number;
  knownStructuralColumns?: string[];
  includeComments?: boolean;
};

export type ColumnScanPayload = {
  request: ColumnScanRequest;
  source: "mapped" | "mock";
};

export type ColumnScanResult = {
  selectedColumns: string[];
  columnRoles: Record<string, "condition" | "comment" | "noise">;
  factorCandidates: string[];
  notes: string;
  uncertainties: string[];
};

export type ColumnScanResponse =
  | { ok: true; requestId: string; result: ColumnScanResult }
  | { ok: false; requestId: string; error: string; details?: string };
