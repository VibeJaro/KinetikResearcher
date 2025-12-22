import * as XLSX from "xlsx";

import type { Dataset, Experiment, RawTable, Series } from "./types";

type ParsedFileResult = {
  rawTable: RawTable;
  sheetNames: string[];
  dataset: Dataset;
};

const createId = () => crypto.randomUUID();

const normalizeHeader = (value: unknown, index: number) => {
  const text = String(value ?? "").trim();
  return text.length > 0 ? text : `Column ${index + 1}`;
};

const isNumericValue = (value: string) => {
  if (value.trim() === "") {
    return false;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed);
};

const toCellValue = (value: unknown): string | number | null => {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed === "") {
      return null;
    }
    if (isNumericValue(trimmed)) {
      return Number(trimmed);
    }
    return trimmed;
  }
  return String(value);
};

const splitDelimitedLine = (line: string, delimiter: string) => {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (inQuotes && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === delimiter && !inQuotes) {
      cells.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  cells.push(current);
  return cells;
};

const detectDelimiter = (line: string) => {
  const commaCount = line.split(",").length - 1;
  const semicolonCount = line.split(";").length - 1;
  return semicolonCount > commaCount ? ";" : ",";
};

const buildRawTable = (
  sheetName: string | undefined,
  rows: unknown[][]
): RawTable => {
  if (rows.length === 0) {
    throw new Error("No rows found in file.");
  }

  const headers = rows[0].map((value, index) => normalizeHeader(value, index));
  const dataRows = rows.slice(1).map((row) => {
    const trimmed = row.slice(0, headers.length);
    while (trimmed.length < headers.length) {
      trimmed.push(null);
    }
    return trimmed.map((value) => toCellValue(value));
  });

  return {
    sheetName,
    headers,
    rows: dataRows
  };
};

const deriveExperiment = (rawTable: RawTable): Experiment | null => {
  const lowerHeaders = rawTable.headers.map((header) => header.toLowerCase());
  const timeIndex = lowerHeaders.findIndex(
    (header) => header === "t" || header.includes("time")
  );

  if (timeIndex === -1) {
    return null;
  }

  const numericCounts = rawTable.headers.map((_, index) => {
    let count = 0;
    let total = 0;
    rawTable.rows.forEach((row) => {
      const value = row[index];
      if (value !== null && value !== undefined) {
        total += 1;
      }
      if (typeof value === "number" && Number.isFinite(value)) {
        count += 1;
      }
    });
    return { count, total };
  });

  let valueIndex = -1;
  let bestScore = 0;
  numericCounts.forEach((stats, index) => {
    if (index === timeIndex) {
      return;
    }
    if (stats.total === 0) {
      return;
    }
    const ratio = stats.count / stats.total;
    if (stats.count >= 2 && ratio >= 0.6 && ratio > bestScore) {
      bestScore = ratio;
      valueIndex = index;
    }
  });

  if (valueIndex === -1) {
    return null;
  }

  const time: number[] = [];
  const y: number[] = [];

  rawTable.rows.forEach((row) => {
    const t = row[timeIndex];
    const v = row[valueIndex];
    if (typeof t === "number" && typeof v === "number") {
      time.push(t);
      y.push(v);
    }
  });

  if (time.length === 0) {
    return null;
  }

  const series: Series = {
    id: createId(),
    name: rawTable.headers[valueIndex] ?? "Series 1",
    time,
    y,
    meta: {
      sourceColumns: {
        time: rawTable.headers[timeIndex],
        value: rawTable.headers[valueIndex]
      }
    }
  };

  return {
    id: createId(),
    name: "Auto-mapped Experiment",
    raw: {
      timeColumn: rawTable.headers[timeIndex],
      valueColumn: rawTable.headers[valueIndex]
    },
    series: [series]
  };
};

export const parseCsvText = (text: string): RawTable => {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const firstLine = lines.find((line) => line.trim().length > 0);
  if (!firstLine) {
    throw new Error("CSV file is empty.");
  }
  const delimiter = detectDelimiter(firstLine);
  const rows = lines
    .filter((line) => line.trim().length > 0)
    .map((line) => splitDelimitedLine(line, delimiter));

  return buildRawTable(undefined, rows);
};

export const parseXlsxData = (data: ArrayBuffer): { rawTable: RawTable; sheetNames: string[] } => {
  const workbook = XLSX.read(data, { type: "array" });
  const sheetNames = workbook.SheetNames;
  if (sheetNames.length === 0) {
    throw new Error("Workbook has no sheets.");
  }
  const sheetName = sheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    throw new Error("Unable to read first worksheet.");
  }
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true }) as unknown[][];
  const rawTable = buildRawTable(sheetName, rows);
  return { rawTable, sheetNames };
};

export const buildDatasetFromRawTable = (
  fileName: string,
  rawTable: RawTable,
  auditEntries: Dataset["audit"]
): Dataset => {
  const experiment = deriveExperiment(rawTable);
  return {
    id: createId(),
    name: fileName,
    createdAt: new Date().toISOString(),
    experiments: experiment ? [experiment] : [],
    audit: auditEntries
  };
};

export const parseFileToDataset = async (file: File): Promise<ParsedFileResult> => {
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (extension === "csv") {
    const text = await file.text();
    const rawTable = parseCsvText(text);
    const dataset = buildDatasetFromRawTable(file.name, rawTable, []);
    return { rawTable, sheetNames: [], dataset };
  }

  if (extension === "xlsx") {
    const data = await file.arrayBuffer();
    const { rawTable, sheetNames } = parseXlsxData(data);
    const dataset = buildDatasetFromRawTable(file.name, rawTable, []);
    return { rawTable, sheetNames, dataset };
  }

  throw new Error("Unsupported file type. Please upload a .csv or .xlsx file.");
};
