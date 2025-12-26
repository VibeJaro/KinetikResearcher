import type { RawTable } from "./types";

const numericPattern = /^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/;

const sanitizeText = (text: string): string =>
  text
    .replace(/^\uFEFF/, "")
    .replace(/\\r\\n/g, "\n")
    .replace(/\\r/g, "\n")
    .replace(/\\n/g, "\n")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");

const detectDelimiter = (headerLine: string): string => {
  const commaCount = (headerLine.match(/,/g) ?? []).length;
  const semicolonCount = (headerLine.match(/;/g) ?? []).length;
  return semicolonCount > commaCount ? ";" : ",";
};

const parseDelimitedLine = (line: string, delimiter: string): string[] => {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      const nextChar = line[index + 1];
      if (inQuotes && nextChar === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === delimiter && !inQuotes) {
      result.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  result.push(current);
  return result;
};

const coerceCell = (value: string): string | number | null => {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  if (numericPattern.test(trimmed)) {
    const parsed = Number(trimmed);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }
  return trimmed;
};

const buildHeaders = (rawHeaders: string[]): string[] =>
  rawHeaders.map((header, index) => {
    const trimmed = header.trim();
    return trimmed ? trimmed : `Column ${index + 1}`;
  });

export const parseCsvText = (text: string): RawTable => {
  const sanitized = sanitizeText(text);
  const lines = sanitized.split("\n").filter((line) => line.trim().length > 0);
  if (lines.length === 0) {
    throw new Error("CSV appears to be empty.");
  }

  const delimiter = detectDelimiter(lines[0]);
  const rawHeaders = parseDelimitedLine(lines[0], delimiter);
  const headers = buildHeaders(rawHeaders);
  const rows = lines.slice(1).map((line) => {
    const rawValues = parseDelimitedLine(line, delimiter);
    const normalized = headers.map((_, index) => rawValues[index] ?? "");
    return normalized.map(coerceCell);
  });

  return {
    headers,
    rows
  };
};
