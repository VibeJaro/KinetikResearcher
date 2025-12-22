import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";
import { parseCsvText } from "../lib/import/parseCsv";
import { parseXlsxBuffer } from "../lib/import/parseXlsx";

describe("import parsing", () => {
  it("parses CSV with comma delimiter", () => {
    const csv = "time,value\\n0,1\\n1,2";
    const table = parseCsvText(csv);

    expect(table.headers).toEqual(["time", "value"]);
    expect(table.rows).toEqual([
      [0, 1],
      [1, 2]
    ]);
  });

  it("parses CSV with semicolon delimiter", () => {
    const csv = "t;signal\\n0;3.5\\n1;4.1";
    const table = parseCsvText(csv);

    expect(table.headers).toEqual(["t", "signal"]);
    expect(table.rows).toEqual([
      [0, 3.5],
      [1, 4.1]
    ]);
  });

  it("parses XLSX first sheet", () => {
    const sheet = XLSX.utils.aoa_to_sheet([
      ["time", "value"],
      [0, 10],
      [1, 12]
    ]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, "Run1");
    const buffer = XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer;

    const tables = parseXlsxBuffer(buffer);

    expect(tables).toHaveLength(1);
    expect(tables[0].sheetName).toBe("Run1");
    expect(tables[0].headers).toEqual(["time", "value"]);
    expect(tables[0].rows).toEqual([
      [0, 10],
      [1, 12]
    ]);
  });
});
