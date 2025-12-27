import type { Experiment, RawTable } from "../import/types";
import type { ColumnScanRequest, ColumnSummary } from "./types";

const truncateValue = (value: string | number, limit = 80): string | number => {
  if (typeof value === "number") {
    return value;
  }
  if (value.length <= limit) {
    return value;
  }
  return `${value.slice(0, limit)}…`;
};

const normalizeMetaValue = (value: string | number | null): string | number | null => {
  if (value === null) {
    return null;
  }
  if (typeof value === "number") {
    return Number.isNaN(value) ? null : value;
  }
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
};

const pickCollapsedValue = (values: Array<string | number | null>): {
  value: string | number | null;
  consistent: boolean;
  distinctValues: Array<string | number>;
} => {
  const normalized = values
    .map(normalizeMetaValue)
    .filter((item): item is string | number => item !== null);

  if (normalized.length === 0) {
    return { value: null, consistent: true, distinctValues: [] };
  }

  const counts = normalized.reduce<Map<string | number, number>>((acc, item) => {
    const next = acc.get(item) ?? 0;
    acc.set(item, next + 1);
    return acc;
  }, new Map());

  let winner: string | number = normalized[0];
  let maxCount = 0;
  counts.forEach((count, item) => {
    if (count > maxCount) {
      maxCount = count;
      winner = item;
    }
  });

  const distinctValues = Array.from(new Set(normalized));
  return { value: winner, consistent: distinctValues.length <= 1, distinctValues };
};

export const collapseMetadataForExperiment = ({
  headers,
  rows,
  timeIndex,
  valueIndices,
  experimentIndex,
  replicateIndex
}: {
  headers: RawTable["headers"];
  rows: RawTable["rows"];
  timeIndex: number;
  valueIndices: number[];
  experimentIndex: number;
  replicateIndex: number;
}): {
  metaRaw: Record<string, string | number | null>;
  metaConsistency: Record<string, { consistent: boolean; distinctValues: Array<string | number> }>;
} => {
  const metaRaw: Record<string, string | number | null> = {};
  const metaConsistency: Record<string, { consistent: boolean; distinctValues: Array<string | number> }> = {};

  headers.forEach((header, index) => {
    const isValueColumn = valueIndices.includes(index);
    if (index === timeIndex || isValueColumn || index === experimentIndex || index === replicateIndex) {
      return;
    }

    const columnValues = rows.map((row) => row[index] ?? null);
    const { value, consistent, distinctValues } = pickCollapsedValue(columnValues);
    metaRaw[header] = value;
    metaConsistency[header] = { consistent, distinctValues };
  });

  return { metaRaw, metaConsistency };
};

const inferType = (values: Array<string | number | null>): "text" | "number" => {
  const numericCount = values.filter((value) => typeof value === "number").length;
  return numericCount > values.length / 2 ? "number" : "text";
};

export const buildColumnScanRequest = (experiments: Experiment[]): ColumnScanRequest => {
  const columnValues = new Map<string, Array<string | number | null>>();

  experiments.forEach((experiment) => {
    if (!experiment.metaRaw) {
      return;
    }
    Object.entries(experiment.metaRaw).forEach(([key, value]) => {
      const list = columnValues.get(key) ?? [];
      list.push(value);
      columnValues.set(key, list);
    });
  });

  const columns: ColumnSummary[] = Array.from(columnValues.entries()).map(
    ([name, values]) => {
      const nonNullValues = values.filter((value) => value !== null);
      const typeHeuristic = inferType(values);
      const exampleValues = Array.from(new Set(nonNullValues))
        .slice(0, 8)
        .map((value) => truncateValue(value));

      const nonNullRatio = values.length === 0 ? 0 : nonNullValues.length / values.length;

      return {
        name,
        typeHeuristic,
        nonNullRatio,
        examples: exampleValues
      };
    }
  );

  return {
    columns,
    experimentCount: experiments.length,
    knownStructuralColumns: ["experimentId", "time", "signal"]
  };
};
