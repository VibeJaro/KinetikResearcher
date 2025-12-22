import * as XLSX from "xlsx";
import type { RawTable } from "./types";

const normalizeCell = (value: unknown): string | number | null => {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === "number") {
    return value;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === "boolean") {
    return value ? "TRUE" : "FALSE";
  }
  return String(value);
};

const buildHeaders = (rawHeaders: unknown[]): string[] =>
  rawHeaders.map((header, index) => {
    const label = normalizeCell(header);
    if (label === null || label === "") {
      return `Column ${index + 1}`;
    }
    return String(label);
  });

export const parseXlsxBuffer = (buffer: ArrayBuffer): RawTable[] => {
  const workbook = XLSX.read(buffer, { type: "array" });
  return workbook.SheetNames.map((sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      blankrows: false
    }) as unknown[][];

    const rawHeaders = rows[0] ?? [];
    const headers = buildHeaders(rawHeaders);
    const dataRows = rows.slice(1).map((row) => {
      const normalized = headers.map((_, index) => normalizeCell(row[index]));
      return normalized.map((cell) => cell ?? null);
    });

    return {
      sheetName,
      headers,
      rows: dataRows
    };
  });
};
