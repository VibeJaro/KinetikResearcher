import type {
  Dataset,
  Experiment,
  MetadataValue,
  RawTable,
  Series
} from "./types";
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

const normalizeMetadataValue = (value: string | number | null): MetadataValue => {
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
  const numericCandidate = parseNumericCell(trimmed);
  if (numericCandidate !== null) {
    return numericCandidate;
  }
  return trimmed;
};

const collapseMetadataValues = (values: MetadataValue[]): {
  value: MetadataValue;
  consistent: boolean;
} => {
  const nonNullValues = values.filter((item) => item !== null) as (string | number)[];
  if (nonNullValues.length === 0) {
    return { value: null, consistent: true };
  }

  const counts = new Map<string, { value: string | number; count: number; firstIndex: number }>();
  nonNullValues.forEach((item, index) => {
    const key = typeof item === "number" ? `num:${item}` : `str:${item.toLowerCase()}`;
    const existing = counts.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      counts.set(key, { value: item, count: 1, firstIndex: index });
    }
  });

  const sorted = Array.from(counts.values()).sort((a, b) => {
    if (b.count === a.count) {
      return a.firstIndex - b.firstIndex;
    }
    return b.count - a.count;
  });

  const uniqueCount = counts.size;
  const collapsed = sorted[0]?.value ?? null;
  return {
    value: collapsed ?? null,
    consistent: uniqueCount <= 1
  };
};

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

  const experimentName =
    selection.experimentColumnIndex === null
      ? fileName || "Experiment 1"
      : null;

  const groupMap = new Map<string, (string | number | null)[][]>();
  const structuralIndices = new Set<number>([
    timeIndex,
    ...selection.valueColumnIndices,
    ...(experimentIndex === -1 ? [] : [experimentIndex]),
    ...(replicateIndex === -1 ? [] : [replicateIndex])
  ]);
  const metadataIndices = headers
    .map((_, index) => index)
    .filter((index) => !structuralIndices.has(index));

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
      series,
      ...(() => {
        const metaRaw: Record<string, MetadataValue> = {};
        const metaConsistency: Record<string, boolean> = {};
        metadataIndices.forEach((index) => {
          const header = headers[index] ?? `Column ${index + 1}`;
          const normalizedValues = rows.map((row) => normalizeMetadataValue(row[index] ?? null));
          const { value, consistent } = collapseMetadataValues(normalizedValues);
          metaRaw[header] = value;
          metaConsistency[header] = consistent;
        });
        return { metaRaw, metaConsistency };
      })()
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
