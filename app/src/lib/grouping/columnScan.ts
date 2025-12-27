import type { ColumnScanRequest, ColumnScanResult, ColumnSummary } from "./types";

const truncateValue = (value: string | number | null, maxLength: number): string => {
  if (value === null) {
    return "";
  }
  const stringValue = typeof value === "string" ? value : String(value);
  if (stringValue.length <= maxLength) {
    return stringValue;
  }
  return `${stringValue.slice(0, maxLength)}…`;
};

const toTypeHeuristic = (values: (string | number | null)[]): ColumnSummary["typeHeuristic"] => {
  const nonNullValues = values.filter((value): value is string | number => value !== null);
  if (nonNullValues.length === 0) {
    return "text";
  }
  const numericCount = nonNullValues.filter((value) => typeof value === "number").length;
  const stringCount = nonNullValues.length - numericCount;
  if (numericCount === nonNullValues.length) {
    return "numeric";
  }
  if (stringCount === nonNullValues.length) {
    return "text";
  }
  return "mixed";
};

export const summarizeColumns = ({
  experiments,
  maxExamples = 8
}: {
  experiments: Array<{
    experimentId: string;
    metaRaw: Record<string, string | number | null>;
  }>;
  maxExamples?: number;
}): ColumnSummary[] => {
  const columnNames = Array.from(
    experiments.reduce<Set<string>>((set, experiment) => {
      const meta = experiment.metaRaw ?? {};
      Object.keys(meta).forEach((key) => set.add(key));
      return set;
    }, new Set<string>())
  );

  return columnNames.map((name) => {
    const values = experiments.map((experiment) => (experiment.metaRaw ?? {})[name] ?? null);
    const nonNullValues = values.filter((value) => value !== null);
    const examples = nonNullValues
      .slice(0, maxExamples)
      .map((value) => truncateValue(value, 60));

    const typeHeuristic = toTypeHeuristic(values);
    const nonNullRatio = values.length === 0 ? 0 : nonNullValues.length / values.length;

    return {
      name,
      typeHeuristic,
      nonNullRatio,
      examples
    } satisfies ColumnSummary;
  });
};

export const buildColumnScanPayload = ({
  experiments,
  knownStructuralColumns
}: {
  experiments: Array<{ experimentId: string; metaRaw: Record<string, string | number | null> }>;
  knownStructuralColumns: string[];
}): ColumnScanRequest => {
  return {
    columns: summarizeColumns({ experiments }),
    experimentCount: experiments.length,
    knownStructuralColumns
  };
};

export const emptyColumnScanResult: ColumnScanResult = {
  selectedColumns: [],
  columnRoles: {},
  factorCandidates: [],
  notes: "",
  uncertainties: []
};
