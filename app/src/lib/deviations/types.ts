import type { Experiment } from "../../types/experiment";
import type { DeviationCategory } from "./categories";

export type ExperimentComment = {
  key: string;
  value: string;
};

export type DeviationCategoryFinding = {
  category: DeviationCategory;
  severity: "low" | "medium" | "high";
  rationale: string;
  sourceColumns: string[];
};

export type DeviationAnalysis = {
  experimentId: string;
  experimentName?: string;
  summary: string;
  categories: DeviationCategoryFinding[];
  model: string;
  usedFallback: boolean;
  rawModelText?: string | null;
};

export type DeviationClientRequest = {
  experiment: Experiment;
  model?: string;
  timeoutMs?: number;
  includeMetaKeys?: string[];
};

export type DeviationClientResult = {
  result: DeviationAnalysis;
  requestId?: string | null;
};
