export type RawTable = {
  sheetName?: string;
  headers: string[];
  rows: (string | number | null)[][];
};

export type TimeUnit = "seconds" | "minutes" | "hours" | "days";

export type TimeInfo = {
  rawValues: (number | string | Date | null)[];
  detectedType: "numeric" | "datetime" | "invalid";
  declaredUnit?: TimeUnit | null;
  invalidCount?: number;
};

export type Series = {
  id: string;
  name: string;
  time: number[];
  y: number[];
  meta?: {
    droppedPoints?: number;
    replicateColumn?: string | null;
    timeInfo?: TimeInfo;
  };
};

export type Experiment = {
  id: string;
  name: string;
  raw?: unknown;
  series: Series[];
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
