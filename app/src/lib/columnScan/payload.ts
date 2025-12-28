import type {
  ColumnScanPayload,
  ColumnScanRequest,
  ColumnSummary,
  ColumnTypeHeuristic
} from "../../types/columnScan";
import { parseNumericCell, type MappingSelection, type MappingStats } from "../import/mapping";
import type { RawTable } from "../import/types";

const truncateExample = (value: unknown): string => {
  const text =
    typeof value === "string"
      ? value
      : typeof value === "number"
        ? value.toString()
        : value === null || value === undefined
          ? ""
          : String(value);
  return text.slice(0, 120);
};

const detectTypeHeuristic = (values: (string | number | null)[]): ColumnTypeHeuristic => {
  const nonNullValues = values.filter(
    (value) => value !== null && !(typeof value === "string" && value.trim() === "")
  );
  if (nonNullValues.length === 0) {
    return "text";
  }
  const numericCount = nonNullValues.reduce<number>((count, value) => {
    const parsed = parseNumericCell(value);
    return parsed === null ? count : count + 1;
  }, 0);
  if (numericCount === nonNullValues.length) {
    return "numeric";
  }
  if (numericCount === 0) {
    return "text";
  }
  return "mixed";
};

const buildColumnSummaries = (table: RawTable): ColumnSummary[] => {
  const rows = Array.isArray(table.rows) ? table.rows : [];
  return table.headers.slice(0, 500).map((header, columnIndex) => {
    const columnValues = rows.map((row) => row?.[columnIndex] ?? null);
    const nonNullValues = columnValues.filter(
      (value) => value !== null && !(typeof value === "string" && value.trim() === "")
    );
    const ratio =
      columnValues.length === 0 ? 0 : nonNullValues.length / Math.max(columnValues.length, 1);
    const nonNullRatio = Math.min(1, Math.max(0, Number(ratio.toFixed(3))));

    const uniqueExamples: string[] = [];
    for (const value of nonNullValues) {
      if (uniqueExamples.length >= 6) {
        break;
      }
      const label = truncateExample(value);
      if (label && !uniqueExamples.includes(label)) {
        uniqueExamples.push(label);
      }
    }

    return {
      name: String(header ?? "").trim() || `Column ${columnIndex + 1}`,
      typeHeuristic: detectTypeHeuristic(columnValues),
      nonNullRatio,
      examples: uniqueExamples
    };
  });
};

const buildKnownStructuralColumns = (
  table: RawTable,
  selection: MappingSelection
): string[] => {
  const headers = table.headers;
  const pick = (index: number | null): string | null =>
    index !== null && headers[index] !== undefined ? String(headers[index]) : null;
  const structural = new Set<string>();
  const time = pick(selection.timeColumnIndex);
  const experiment = pick(selection.experimentColumnIndex);
  const replicate = pick(selection.replicateColumnIndex);
  if (time) {
    structural.add(time);
  }
  if (experiment) {
    structural.add(experiment);
  }
  if (replicate) {
    structural.add(replicate);
  }
  selection.valueColumnIndices.forEach((index) => {
    const valueHeader = pick(index);
    if (valueHeader) {
      structural.add(valueHeader);
    }
  });
  return Array.from(structural);
};

const createMockColumnScanRequest = (): ColumnScanRequest => ({
  columns: [
    {
      name: "Catalyst_used",
      typeHeuristic: "text",
      nonNullRatio: 0.95,
      examples: ["Pd/C", "Pd on C", "Pd/C reused"]
    },
    {
      name: "Additive",
      typeHeuristic: "text",
      nonNullRatio: 0.72,
      examples: ["NaOAc", "KOAc"]
    },
    {
      name: "Temp_C",
      typeHeuristic: "numeric",
      nonNullRatio: 0.9,
      examples: ["70", "85"]
    },
    {
      name: "experimentId",
      typeHeuristic: "text",
      nonNullRatio: 1,
      examples: ["exp-1", "exp-2"]
    },
    {
      name: "signal",
      typeHeuristic: "numeric",
      nonNullRatio: 0.98,
      examples: ["0.12", "0.32"]
    }
  ],
  experimentCount: 80,
  knownStructuralColumns: ["experimentId", "time", "signal"]
});

export const buildColumnScanPayload = ({
  normalizedTable,
  mappingSelection,
  mappingStats
}: {
  normalizedTable: RawTable | null;
  mappingSelection: MappingSelection;
  mappingStats: MappingStats | null;
}): ColumnScanPayload => {
  if (!normalizedTable || normalizedTable.headers.length === 0) {
    return { request: createMockColumnScanRequest(), source: "mock" };
  }

  const columns = buildColumnSummaries(normalizedTable);
  const knownStructuralColumns = buildKnownStructuralColumns(normalizedTable, mappingSelection);
  const experimentCount =
    typeof mappingStats?.experimentCount === "number" ? mappingStats.experimentCount : undefined;

  if (columns.length === 0) {
    return { request: createMockColumnScanRequest(), source: "mock" };
  }

  const request: ColumnScanRequest = {
    columns,
    experimentCount,
    knownStructuralColumns
  };

  return { request, source: "mapped" };
};
