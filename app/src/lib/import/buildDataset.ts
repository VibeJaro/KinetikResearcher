import type { Dataset, Experiment, RawTable, Series } from "./types";
import { ensureMetaRaw } from "./types";

const numericPattern = /^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/;

const createId = (prefix: string): string =>
  `${prefix}-${Math.random().toString(36).slice(2, 10)}`;

const isNumeric = (value: string | number | null): value is number => {
  if (value === null) {
    return false;
  }
  if (typeof value === "number") {
    return !Number.isNaN(value);
  }
  if (typeof value === "string" && numericPattern.test(value.trim())) {
    const parsed = Number(value);
    return !Number.isNaN(parsed);
  }
  return false;
};

const toNumber = (value: string | number | null): number | null => {
  if (value === null) {
    return null;
  }
  if (typeof value === "number") {
    return Number.isNaN(value) ? null : value;
  }
  if (numericPattern.test(value.trim())) {
    const parsed = Number(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
};

const findTimeColumn = (headers: string[]): number =>
  headers.findIndex((header) => /\b(time|t)\b/i.test(header.trim()));

const findNumericColumn = (rows: RawTable["rows"], timeIndex: number): number => {
  const columnCount = rows[0]?.length ?? 0;
  let bestIndex = -1;
  let bestScore = 0;

  for (let columnIndex = 0; columnIndex < columnCount; columnIndex += 1) {
    if (columnIndex === timeIndex) {
      continue;
    }
    let numericCount = 0;
    let nonEmptyCount = 0;
    rows.forEach((row) => {
      const cell = row[columnIndex] ?? null;
      if (cell !== null && cell !== "") {
        nonEmptyCount += 1;
      }
      if (isNumeric(cell)) {
        numericCount += 1;
      }
    });
    if (nonEmptyCount === 0) {
      continue;
    }
    const score = numericCount / nonEmptyCount;
    if (score > bestScore && numericCount > 0) {
      bestScore = score;
      bestIndex = columnIndex;
    }
  }

  return bestScore >= 0.6 ? bestIndex : -1;
};

export const buildDatasetFromRawTable = (
  table: RawTable,
  fileName: string,
  createdAt = new Date()
): Dataset => {
  const timeIndex = findTimeColumn(table.headers);
  const valueIndex = findNumericColumn(table.rows, timeIndex);
  const experiments: Experiment[] = [];

  if (timeIndex >= 0 && valueIndex >= 0) {
    const time: number[] = [];
    const y: number[] = [];

    table.rows.forEach((row) => {
      const timeValue = toNumber(row[timeIndex] ?? null);
      const yValue = toNumber(row[valueIndex] ?? null);
      if (timeValue === null || yValue === null) {
        return;
      }
      time.push(timeValue);
      y.push(yValue);
    });

    if (time.length > 0 && y.length > 0) {
      const series: Series = {
        id: createId("series"),
        name: table.headers[valueIndex] ?? "Series 1",
        time,
        y
      };

      experiments.push(
        ensureMetaRaw({
          experimentId: createId("exp"),
          name: "Auto-mapped experiment",
          series: [series]
        })
      );
    }
  }

  return {
    id: createId("dataset"),
    name: fileName,
    createdAt: createdAt.toISOString(),
    experiments,
    audit: []
  };
};
