import type { Dataset, Experiment, RawTable, Series } from "./types";
import { detectTimeType } from "./time";

export type MappingSelection = {
  firstRowIsHeader: boolean;
  timeColumnIndex: number | null;
  valueColumnIndices: number[];
  experimentColumnIndex: number | null;
  replicateColumnIndex: number | null;
};

export type MappingError = {
  rowIndex: number;
  column: string;
  message: string;
};

export type MappingStats = {
  experimentCount: number;
  seriesCount: number;
  pointCount: number;
};

export type MappingResolvedColumns = {
  time: string;
  values: string[];
  experiment: string | null;
  replicate: string | null;
};

export type MappingApplyResult = {
  dataset: Dataset | null;
  errors: MappingError[];
  stats: MappingStats;
  resolvedColumns: MappingResolvedColumns | null;
};

const numericPattern = /^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/;
const commaDecimalPattern = /^-?\d+,\d+(?:[eE][+-]?\d+)?$/;

const createId = (prefix: string): string =>
  `${prefix}-${Math.random().toString(36).slice(2, 10)}`;

export const normalizeMappingTable = (
  table: RawTable,
  firstRowIsHeader: boolean
): RawTable => {
  if (firstRowIsHeader) {
    return table;
  }

  const headers = table.headers.map((_, index) => `Column ${index + 1}`);
  const rows = [table.headers, ...table.rows];
  return { ...table, headers, rows };
};

export const parseNumericCell = (value: string | number | null): number | null => {
  if (value === null) {
    return null;
  }
  if (typeof value === "number") {
    return Number.isNaN(value) ? null : value;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const cleaned = trimmed.replace(/\s+/g, "");
  if (commaDecimalPattern.test(cleaned)) {
    const normalized = cleaned.replace(",", ".");
    const parsed = Number(normalized);
    return Number.isNaN(parsed) ? null : parsed;
  }
  if (numericPattern.test(cleaned)) {
    const parsed = Number(cleaned);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
};

const toLabel = (value: string | number | null): string => {
  if (value === null) {
    return "";
  }
  if (typeof value === "number") {
    return Number.isNaN(value) ? "" : value.toString();
  }
  return value.trim();
};

const hasRowContent = (row: (string | number | null)[]): boolean =>
  row.some((cell) => {
    if (cell === null) {
      return false;
    }
    if (typeof cell === "number") {
      return !Number.isNaN(cell);
    }
    return cell.trim().length > 0;
  });

export const applyMappingToDataset = ({
  table,
  selection,
  fileName,
  datasetId,
  createdAt
}: {
  table: RawTable;
  selection: MappingSelection;
  fileName: string;
  datasetId?: string;
  createdAt?: string;
}): MappingApplyResult => {
  const normalizedTable = normalizeMappingTable(table, selection.firstRowIsHeader);
  const headers = normalizedTable.headers;

  const errors: MappingError[] = [];
  if (selection.timeColumnIndex === null) {
    errors.push({ rowIndex: 0, column: "time", message: "Select a time column." });
  }
  if (selection.valueColumnIndices.length === 0) {
    errors.push({
      rowIndex: 0,
      column: "value",
      message: "Select at least one value column."
    });
  }

  if (errors.length > 0) {
    return {
      dataset: null,
      errors,
      stats: { experimentCount: 0, seriesCount: 0, pointCount: 0 },
      resolvedColumns: null
    };
  }

  const timeIndex = selection.timeColumnIndex ?? -1;
  const experimentIndex = selection.experimentColumnIndex ?? -1;
  const replicateIndex = selection.replicateColumnIndex ?? -1;
  const metadataIndices = headers
    .map((_, index) => index)
    .filter(
      (index) =>
        index !== timeIndex &&
        index !== experimentIndex &&
        index !== replicateIndex &&
        !selection.valueColumnIndices.includes(index)
    );

  const experimentName =
    selection.experimentColumnIndex === null
      ? fileName || "Experiment 1"
      : null;

  const groupMap = new Map<string, (string | number | null)[][]>();

  normalizedTable.rows.forEach((row, rowIndex) => {
    if (!hasRowContent(row)) {
      return;
    }
    const timeValue = parseNumericCell(row[timeIndex] ?? null);
    if (timeValue === null) {
      const timeLabel = headers[timeIndex] ?? "Time";
      errors.push({
        rowIndex: rowIndex + 1,
        column: timeLabel,
        message: "Time value must be numeric."
      });
      return;
    }
    const label =
      experimentIndex === -1
        ? experimentName ?? "Experiment 1"
        : toLabel(row[experimentIndex] ?? null) || "Unlabeled experiment";
    const group = groupMap.get(label) ?? [];
    group.push(row);
    groupMap.set(label, group);
  });

  if (errors.length > 0) {
    return {
      dataset: null,
      errors,
      stats: { experimentCount: 0, seriesCount: 0, pointCount: 0 },
      resolvedColumns: null
    };
  }

  const experiments: Experiment[] = [];
  let pointCount = 0;

  Array.from(groupMap.entries()).forEach(([groupName, rows]) => {
    const metaRaw: Record<string, string | number | null> = {};
    const metaConsistency: Experiment["metaConsistency"] = {};

    metadataIndices.forEach((index) => {
      const header = headers[index] ?? `Column ${index + 1}`;
      const values = rows
        .map((row) => row[index] ?? null)
        .map((value) => {
          if (typeof value === "string") {
            const trimmed = value.trim();
            return trimmed.length === 0 ? null : trimmed;
          }
          return value;
        });

      const nonNullValues = values.filter(
        (value): value is string | number => value !== null && value !== ""
      );

      if (nonNullValues.length === 0) {
        metaRaw[header] = null;
        metaConsistency[header] = {
          consistent: true,
          strategy: "first-non-null",
          uniqueValueCount: 0
        };
        return;
      }

      const frequency = new Map<string | number, number>();
      nonNullValues.forEach((value) => {
        const count = frequency.get(value) ?? 0;
        frequency.set(value, count + 1);
      });

      let selectedValue: string | number = nonNullValues[0];
      let strategy: "most-frequent" | "first-non-null" = "first-non-null";

      const sorted = Array.from(frequency.entries()).sort(
        (a, b) => b[1] - a[1]
      );

      if (sorted[0]) {
        const [value, count] = sorted[0];
        const hasClearWinner = sorted.length === 1 || count > sorted[1][1];
        selectedValue = value;
        strategy = hasClearWinner ? "most-frequent" : "first-non-null";
      }

      metaRaw[header] = selectedValue;
      metaConsistency[header] = {
        consistent: new Set(nonNullValues).size === 1,
        strategy,
        uniqueValueCount: new Set(nonNullValues).size
      };
    });

    const series: Series[] = selection.valueColumnIndices.map((valueIndex) => {
      const time: number[] = [];
      const y: number[] = [];
      let droppedPoints = 0;

      rows.forEach((row) => {
        const timeValue = parseNumericCell(row[timeIndex] ?? null);
        if (timeValue === null) {
          droppedPoints += 1;
          return;
        }
        const value = parseNumericCell(row[valueIndex] ?? null);
        if (value === null) {
          droppedPoints += 1;
          return;
        }
        time.push(timeValue);
        y.push(value);
      });

      pointCount += time.length;

      const timeType = detectTimeType(time);

      return {
        id: createId("series"),
        name: headers[valueIndex] ?? `Series ${valueIndex + 1}`,
        time,
        y,
        meta: {
          droppedPoints,
          timeType,
          replicateColumn:
            replicateIndex === -1 ? null : headers[replicateIndex] ?? null
        }
      };
    });

    experiments.push({
      id: createId("exp"),
      name: groupName,
      raw: {
        timeHeader: headers[timeIndex],
        valueHeaders: selection.valueColumnIndices.map(
          (index) => headers[index] ?? `Column ${index + 1}`
        ),
        experimentHeader:
          experimentIndex === -1 ? null : headers[experimentIndex] ?? null,
        replicateHeader:
          replicateIndex === -1 ? null : headers[replicateIndex] ?? null,
        sheetName: normalizedTable.sheetName
      },
      metaRaw,
      metaConsistency,
      series
    });
  });

  const stats: MappingStats = {
    experimentCount: experiments.length,
    seriesCount: experiments.reduce((sum, experiment) => sum + experiment.series.length, 0),
    pointCount
  };

  const resolvedColumns: MappingResolvedColumns = {
    time: headers[timeIndex] ?? "Time",
    values: selection.valueColumnIndices.map(
      (index) => headers[index] ?? `Column ${index + 1}`
    ),
    experiment: experimentIndex === -1 ? null : headers[experimentIndex] ?? null,
    replicate: replicateIndex === -1 ? null : headers[replicateIndex] ?? null
  };

  return {
    dataset: {
      id: datasetId ?? createId("dataset"),
      name: fileName,
      createdAt: createdAt ?? new Date().toISOString(),
      experiments,
      audit: []
    },
    errors: [],
    stats,
    resolvedColumns
  };
};
