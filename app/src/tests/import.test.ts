import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";

import { parseCsvText, parseXlsxData } from "../lib/import/parse";

describe("import parsing", () => {
  it("parses csv headers and rows", () => {
    const csv = "time,value\n0,1\n1,2\n";
    const table = parseCsvText(csv);

    expect(table.headers).toEqual(["time", "value"]);
    expect(table.rows).toEqual([
      [0, 1],
      [1, 2]
    ]);
  });

  it("parses semicolon csv", () => {
    const csv = "t;signal\n0;5.5\n1;6.1\n";
    const table = parseCsvText(csv);

    expect(table.headers).toEqual(["t", "signal"]);
    expect(table.rows[0]).toEqual([0, 5.5]);
  });

  it("parses xlsx workbook", () => {
    const worksheet = XLSX.utils.aoa_to_sheet([
      ["Time", "Value"],
      [0, 10],
      [1, 12]
    ]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Sheet1");

    const buffer = XLSX.write(workbook, { type: "array", bookType: "xlsx" });
    const { rawTable, sheetNames } = parseXlsxData(buffer as ArrayBuffer);

    expect(sheetNames).toEqual(["Sheet1"]);
    expect(rawTable.headers).toEqual(["Time", "Value"]);
    expect(rawTable.rows).toEqual([
      [0, 10],
      [1, 12]
    ]);
  });
});
