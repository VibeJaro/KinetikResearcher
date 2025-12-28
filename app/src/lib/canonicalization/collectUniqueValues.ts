import type { Experiment } from "../../types/experiment";

export function collectUniqueValues(
  experiments: Array<Pick<Experiment, "experimentId" | "metaRaw">>,
  columnName: string
): { values: string[]; counts: Record<string, number> } {
  if (!columnName.trim()) {
    return { values: [], counts: {} };
  }

  const counts: Record<string, number> = {};

  experiments.forEach((experiment) => {
    const rawValue = experiment.metaRaw?.[columnName];
    if (rawValue === null || rawValue === undefined) {
      return;
    }

    let normalized = "";
    if (typeof rawValue === "string") {
      normalized = rawValue.trim();
    } else if (typeof rawValue === "number") {
      normalized = String(rawValue);
    }

    if (!normalized) {
      return;
    }

    counts[normalized] = (counts[normalized] ?? 0) + 1;
  });

  const sortedEntries = Object.entries(counts).sort((a, b) => {
    if (b[1] === a[1]) {
      return a[0].localeCompare(b[0]);
    }
    return b[1] - a[1];
  });

  const limited = sortedEntries.slice(0, 300);
  const values = limited.map(([value]) => value);
  const limitedCounts = limited.reduce<Record<string, number>>((acc, [value, count]) => {
    acc[value] = count;
    return acc;
  }, {});

  return { values, counts: limitedCounts };
}

