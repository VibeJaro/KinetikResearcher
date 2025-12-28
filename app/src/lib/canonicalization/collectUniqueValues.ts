import type { Experiment } from "../../types/experiment";

export type UniqueValuesResult = {
  values: string[];
  counts: Record<string, number>;
};

const normalizeValue = (value: string | number): string => {
  if (typeof value === "number") {
    return String(value);
  }
  return value.trim();
};

export function collectUniqueValues(
  experiments: Array<{ metaRaw: Experiment["metaRaw"] }>,
  columnName: string
): UniqueValuesResult {
  const counts = new Map<string, number>();

  for (const experiment of experiments) {
    const rawValue = experiment.metaRaw[columnName];
    if (rawValue === null || rawValue === undefined) {
      continue;
    }
    if (typeof rawValue !== "string" && typeof rawValue !== "number") {
      continue;
    }
    const normalized = normalizeValue(rawValue);
    if (!normalized) {
      continue;
    }
    counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
  }

  const sortedEntries = Array.from(counts.entries()).sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0])
  );
  const limited = sortedEntries.slice(0, 300);

  return {
    values: limited.map(([value]) => value),
    counts: Object.fromEntries(limited)
  };
}
