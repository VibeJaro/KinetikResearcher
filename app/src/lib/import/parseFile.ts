import { parseCsvText } from "./parseCsv";
import { parseXlsxBuffer } from "./parseXlsx";
import type { RawTable } from "./types";

export type ParseFileResult = {
  rawTables: RawTable[];
  activeTable: RawTable;
  fileType: "csv" | "xlsx";
  sheetNames: string[];
};

const fileExtension = (name: string): string =>
  name.split(".").pop()?.toLowerCase() ?? "";

export const parseFile = async (file: File): Promise<ParseFileResult> => {
  const extension = fileExtension(file.name);
  if (extension === "csv") {
    const text = await file.text();
    const table = parseCsvText(text);
    return {
      rawTables: [table],
      activeTable: table,
      fileType: "csv",
      sheetNames: []
    };
  }

  if (extension === "xlsx") {
    const buffer = await file.arrayBuffer();
    const tables = parseXlsxBuffer(buffer);
    if (tables.length === 0) {
      throw new Error("No sheets detected in the XLSX file.");
    }
    return {
      rawTables: tables,
      activeTable: tables[0],
      fileType: "xlsx",
      sheetNames: tables.map((table) => table.sheetName ?? "Sheet")
    };
  }

  throw new Error("Unsupported file type. Please upload a .csv or .xlsx file.");
};
