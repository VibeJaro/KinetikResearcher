export type RawTable = {
  sheetName?: string;
  headers: string[];
  rows: (string | number | null)[][];
};

export type Series = {
  id: string;
  name: string;
  time: number[];
  y: number[];
  meta?: Record<string, unknown>;
};

export type Experiment = {
  id: string;
  name: string;
  raw?: unknown;
  series: Series[];
  metaRaw?: Record<string, string | number | null>;
  metaConsistency?: Record<
    string,
    { consistent: boolean; distinctValues: Array<string | number> }
  >;
};

export type AuditEntry = {
  id: string;
  ts: string;
  type: string;
  payload: Record<string, unknown>;
};

export type Dataset = {
  id: string;
  name: string;
  createdAt: string;
  experiments: Experiment[];
  audit: AuditEntry[];
};
