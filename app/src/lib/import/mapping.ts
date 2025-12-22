import type { Dataset, Experiment, RawTable, Series } from "./types";

type TableCell = string | number | null;

type EffectiveTable = {
  headers: string[];
  rows: TableCell[][];
};

export type MappingSelection = {
  useFirstRowAsHeader: boolean;
  timeColumn: string | null;
  valueColumns: string[];
  experimentColumn: string | null;
  replicateColumn: string | null;
};

export type MappingSummary = {
  experiments: number;
  series: number;
  points: number;
};

export type MappingResult = {
  dataset: Dataset;
  summary: MappingSummary;
  errors: string[];
};

const numericPattern = /^-?\d+(?:[.,]\d+)?(?:[eE][+-]?\d+)?$/;

const createId = (prefix: string): string =>
  `${prefix}-${Math.random().toString(36).slice(2, 10)}`;

const normalizeHeaderLabel = (label: string, index: number): string => {
  const trimmed = label.trim();
  return trimmed ? trimmed : `Column ${index + 1}`;
};

export const buildEffectiveTable = (
  table: RawTable,
  useFirstRowAsHeader: boolean
): EffectiveTable => {
  if (useFirstRowAsHeader) {
    return {
      headers: table.headers.map(normalizeHeaderLabel),
      rows: table.rows
    };
  }

  const headers = table.headers.map((_, index) => `Column ${index + 1}`);
  const rows: TableCell[][] = [table.headers, ...table.rows];

  return { headers, rows };
};

export const normalizeMappingSelection = (
  headers: string[],
  selection: MappingSelection
): MappingSelection => {
  const headerSet = new Set(headers);

  const timeColumn = selection.timeColumn && headerSet.has(selection.timeColumn)
    ? selection.timeColumn
    : null;
  const valueColumns = selection.valueColumns.filter((column) => headerSet.has(column));
  const experimentColumn =
    selection.experimentColumn && headerSet.has(selection.experimentColumn)
      ? selection.experimentColumn
      : null;
  const replicateColumn =
    selection.replicateColumn && headerSet.has(selection.replicateColumn)
      ? selection.replicateColumn
      : null;

  return {
    ...selection,
    timeColumn,
    valueColumns,
    experimentColumn,
    replicateColumn
  };
};

export const suggestMappingSelection = (
  table: RawTable,
  useFirstRowAsHeader = true
): MappingSelection => {
  const effectiveTable = buildEffectiveTable(table, useFirstRowAsHeader);
  const timeColumn =
    effectiveTable.headers.find((header) => /\b(time|t)\b/i.test(header)) ?? null;

  return {
    useFirstRowAsHeader,
    timeColumn,
    valueColumns: [],
    experimentColumn: null,
    replicateColumn: null
  };
};

export const parseNumericValue = (value: TableCell): number | null => {
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

  const normalized = trimmed.replace(/\s+/g, "");
  if (!numericPattern.test(normalized)) {
    return null;
  }

  const decimalNormalized = normalized.includes(",") && !normalized.includes(".")
    ? normalized.replace(",", ".")
    : normalized;

  const parsed = Number(decimalNormalized);
  return Number.isNaN(parsed) ? null : parsed;
};

const getColumnIndex = (headers: string[], name: string | null): number =>
  name ? headers.indexOf(name) : -1;

const toLabel = (value: TableCell, fallback: string): string => {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed : fallback;
  }
  if (typeof value === "number" && !Number.isNaN(value)) {
    return String(value);
  }
  return fallback;
};

export const applyMappingToDataset = (
  table: RawTable,
  selection: MappingSelection,
  fileName?: string,
  createdAt = new Date()
): MappingResult => {
  const effectiveTable = buildEffectiveTable(table, selection.useFirstRowAsHeader);
  const normalizedSelection = normalizeMappingSelection(
    effectiveTable.headers,
    selection
  );
  const errors: string[] = [];

  if (!normalizedSelection.timeColumn) {
    errors.push("Select a numeric time column before applying mapping.");
  }
  if (normalizedSelection.valueColumns.length === 0) {
    errors.push("Select at least one value column before applying mapping.");
  }
  if (errors.length > 0) {
    return {
      dataset: {
        id: createId("dataset"),
        name: fileName ?? "Imported dataset",
        createdAt: createdAt.toISOString(),
        experiments: [],
        audit: []
      },
      summary: { experiments: 0, series: 0, points: 0 },
      errors
    };
  }

  const timeIndex = getColumnIndex(effectiveTable.headers, normalizedSelection.timeColumn);
  const experimentIndex = getColumnIndex(
    effectiveTable.headers,
    normalizedSelection.experimentColumn
  );
  const replicateIndex = getColumnIndex(
    effectiveTable.headers,
    normalizedSelection.replicateColumn
  );
  const valueIndices = normalizedSelection.valueColumns.map((column) =>
    getColumnIndex(effectiveTable.headers, column)
  );

  const experimentMap = new Map<string, Experiment>();
  const seriesMap = new Map<string, Series>();
  let totalPoints = 0;
  let invalidTimeCount = 0;
  const maxRowErrors = 5;

  const getExperiment = (label: string): Experiment => {
    const existing = experimentMap.get(label);
    if (existing) {
      return existing;
    }
    const experiment: Experiment = {
      id: createId("exp"),
      name: label,
      series: []
    };
    experimentMap.set(label, experiment);
    return experiment;
  };

  const getSeries = (
    experiment: Experiment,
    valueHeader: string,
    replicateLabel: string | null
  ): Series => {
    const key = `${experiment.id}-${valueHeader}-${replicateLabel ?? "base"}`;
    const existing = seriesMap.get(key);
    if (existing) {
      return existing;
    }

    const name = replicateLabel ? `${valueHeader} (replicate ${replicateLabel})` : valueHeader;
    const series: Series = {
      id: createId("series"),
      name,
      time: [],
      y: [],
      meta: {
        valueColumn: valueHeader,
        replicate: replicateLabel
      }
    };
    seriesMap.set(key, series);
    experiment.series.push(series);
    return series;
  };

  effectiveTable.rows.forEach((row, rowIndex) => {
    const timeValue = parseNumericValue(row[timeIndex] ?? null);
    if (timeValue === null) {
      invalidTimeCount += 1;
      if (errors.length < maxRowErrors) {
        errors.push(`Row ${rowIndex + 1}: time value is not numeric.`);
      }
      return;
    }

    const experimentLabel = normalizedSelection.experimentColumn
      ? toLabel(row[experimentIndex] ?? null, "Unlabeled experiment")
      : fileName ?? "Experiment 1";
    const replicateLabel = normalizedSelection.replicateColumn
      ? toLabel(row[replicateIndex] ?? null, "1")
      : null;

    const experiment = getExperiment(experimentLabel);

    valueIndices.forEach((valueIndex, valuePosition) => {
      const header = normalizedSelection.valueColumns[valuePosition] ?? "Value";
      const value = parseNumericValue(row[valueIndex] ?? null);
      if (value === null) {
        return;
      }
      const series = getSeries(experiment, header, replicateLabel);
      series.time.push(timeValue);
      series.y.push(value);
      totalPoints += 1;
    });
  });

  if (invalidTimeCount > 0) {
    errors.push(`${invalidTimeCount} row(s) skipped due to invalid time values.`);
  }

  const experiments = Array.from(experimentMap.values());
  const seriesCount = experiments.reduce((count, experiment) => count + experiment.series.length, 0);

  return {
    dataset: {
      id: createId("dataset"),
      name: fileName ?? "Imported dataset",
      createdAt: createdAt.toISOString(),
      experiments,
      audit: []
    },
    summary: {
      experiments: experiments.length,
      series: seriesCount,
      points: totalPoints
    },
    errors
  };
};
