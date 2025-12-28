import type { Experiment, ExperimentMetaValue } from "../../types/experiment";

const MAX_VALUES = 300;
const MAX_VALUE_LENGTH = 120;

const normalizeValue = (value: ExperimentMetaValue): string | null => {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      return null;
    }
    return value.toString();
  }
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  return trimmed.slice(0, MAX_VALUE_LENGTH);
};

export const collectUniqueValues = (experiments: Experiment[], columnName: string): string[] => {
  if (!Array.isArray(experiments) || experiments.length === 0 || !columnName) {
    return [];
  }

  const counts = new Map<string, number>();
  const normalizedColumn = columnName.trim();
  experiments.forEach((experiment) => {
    const rawValue = experiment.metaRaw[normalizedColumn] as ExperimentMetaValue;
    const normalizedValue = normalizeValue(rawValue);
    if (!normalizedValue) {
      return;
    }
    counts.set(normalizedValue, (counts.get(normalizedValue) ?? 0) + 1);
  });

  if (counts.size === 0) {
    return [];
  }

  const sorted = Array.from(counts.entries()).sort((a, b) => {
    if (b[1] !== a[1]) {
      return b[1] - a[1];
    }
    return a[0].localeCompare(b[0]);
  });

  return sorted.slice(0, MAX_VALUES).map(([value]) => value);
};
