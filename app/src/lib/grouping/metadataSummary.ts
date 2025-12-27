import type { Dataset, Experiment, MetadataValue } from "../import/types";
import type { ColumnScanPayload, ColumnSummary } from "./types";

const truncateValue = (value: MetadataValue, maxLength = 80): MetadataValue => {
  if (typeof value !== "string") {
    return value;
  }
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength)}…`;
};

const toKey = (value: MetadataValue): string => {
  if (value === null) {
    return "null";
  }
  return typeof value === "number" ? `num:${value}` : `str:${value.toLowerCase()}`;
};

const inferTypeHeuristic = (values: MetadataValue[]): ColumnSummary["typeHeuristic"] => {
  const counts = values.reduce(
    (acc, value) => {
      if (typeof value === "number") {
        acc.numeric += 1;
        return acc;
      }
      if (typeof value === "string") {
        acc.text += 1;
      }
      return acc;
    },
    { numeric: 0, text: 0 }
  );
  if (counts.numeric > 0 && counts.text === 0) {
    return "number";
  }
  if (counts.numeric > 0 && counts.text > 0) {
    return "mixed";
  }
  return "text";
};

const collectMetadataColumns = (experiments: Experiment[]): string[] => {
  const columnSet = new Set<string>();
  experiments.forEach((experiment) => {
    Object.keys(experiment.metaRaw).forEach((key) => columnSet.add(key));
  });
  return Array.from(columnSet);
};

export const summarizeColumns = (dataset: Dataset | null): ColumnSummary[] => {
  if (!dataset || dataset.experiments.length === 0) {
    return [];
  }
  const experiments = dataset.experiments;
  const columns = collectMetadataColumns(experiments);
  const summaries: ColumnSummary[] = [];

  columns.forEach((column) => {
    const values = experiments.map((experiment) => experiment.metaRaw[column] ?? null);
    const nonNullValues = values.filter((value) => value !== null) as MetadataValue[];
    if (nonNullValues.length === 0) {
      return;
    }
    const uniqueExamples: MetadataValue[] = [];
    nonNullValues.forEach((value) => {
      const key = toKey(value);
      if (!uniqueExamples.some((entry) => toKey(entry) === key)) {
        uniqueExamples.push(truncateValue(value));
      }
    });

    summaries.push({
      name: column,
      typeHeuristic: inferTypeHeuristic(nonNullValues),
      nonNullRatio: nonNullValues.length / experiments.length,
      examples: uniqueExamples.slice(0, 8)
    });
  });

  return summaries.sort((a, b) => b.nonNullRatio - a.nonNullRatio);
};

const collectKnownStructuralColumns = (experiments: Experiment[]): string[] => {
  const columnSet = new Set<string>(["experimentId", "time", "signal"]);
  experiments.forEach((experiment) => {
    const raw = (experiment.raw ?? {}) as Record<string, unknown>;
    const timeHeader = typeof raw.timeHeader === "string" ? raw.timeHeader : null;
    const valueHeaders = Array.isArray(raw.valueHeaders)
      ? (raw.valueHeaders.filter((item): item is string => typeof item === "string") ?? [])
      : [];
    const experimentHeader =
      typeof raw.experimentHeader === "string" ? raw.experimentHeader : null;
    const replicateHeader = typeof raw.replicateHeader === "string" ? raw.replicateHeader : null;
    if (timeHeader) columnSet.add(timeHeader);
    valueHeaders.forEach((header) => columnSet.add(header));
    if (experimentHeader) columnSet.add(experimentHeader);
    if (replicateHeader) columnSet.add(replicateHeader);
  });
  return Array.from(columnSet);
};

export const buildColumnScanPayload = (dataset: Dataset | null): ColumnScanPayload | null => {
  if (!dataset || dataset.experiments.length === 0) {
    return null;
  }
  const columns = summarizeColumns(dataset);
  return {
    columns,
    experimentCount: dataset.experiments.length,
    knownStructuralColumns: collectKnownStructuralColumns(dataset.experiments)
  };
};
