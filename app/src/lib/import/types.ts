import type { Experiment, Series } from "../../types/experiment";
export type { Experiment, Series };
export { ensureMetaRaw, normalizeExperimentId } from "../../types/experiment";

export type RawTable = {
  sheetName?: string;
  headers: string[];
  rows: (string | number | null)[][];
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
