import { describe, expect, it } from "vitest";
import type { RawTable } from "../lib/import/types";
import {
  applyMappingToDataset,
  parseNumericCell,
  type MappingSelection
} from "../lib/import/mapping";

describe("mapping logic", () => {
  it("parses numeric values with comma decimals", () => {
    expect(parseNumericCell(" 1,25 ")).toBeCloseTo(1.25);
    expect(parseNumericCell("2.5")).toBeCloseTo(2.5);
    expect(parseNumericCell(" ")).toBeNull();
  });

  it("groups rows by experiment column", () => {
    const table: RawTable = {
      headers: ["time", "value", "exp"],
      rows: [
        [0, 1, "A"],
        [1, 2, "A"],
        [0, 3, "B"]
      ]
    };

    const selection: MappingSelection = {
      firstRowIsHeader: true,
      timeColumnIndex: 0,
      valueColumnIndices: [1],
      experimentColumnIndex: 2,
      replicateColumnIndex: null
    };

    const result = applyMappingToDataset({
      table,
      selection,
      fileName: "run.csv"
    });

    expect(result.errors).toHaveLength(0);
    expect(result.dataset).not.toBeNull();
    expect(result.dataset?.experiments).toHaveLength(2);
    const experimentNames = result.dataset?.experiments.map((exp) => exp.name);
    expect(experimentNames).toEqual(expect.arrayContaining(["A", "B"]));
    const seriesPoints = result.dataset?.experiments.flatMap((exp) =>
      exp.series.map((series) => series.time.length)
    );
    expect(seriesPoints).toEqual(expect.arrayContaining([2, 1]));
  });

  it("aggregates metadata columns with frequency and consistency flags", () => {
    const table: RawTable = {
      headers: ["time", "value", "catalyst", "note"],
      rows: [
        [0, 1, "Pd/C", "fresh"],
        [1, 2, "Pd/C", "fresh"],
        [2, 3, "Ni", "fresh?"]
      ]
    };
    const selection: MappingSelection = {
      firstRowIsHeader: true,
      timeColumnIndex: 0,
      valueColumnIndices: [1],
      experimentColumnIndex: null,
      replicateColumnIndex: null
    };
    const result = applyMappingToDataset({
      table,
      selection,
      fileName: "meta.csv"
    });
    expect(result.dataset?.experiments[0].metaRaw.catalyst).toBe("Pd/C");
    expect(result.dataset?.experiments[0].metaConsistency?.catalyst).toBe(false);
    expect(result.dataset?.experiments[0].metaRaw.note).toBe("fresh");
  });

  it("returns errors when time column is invalid", () => {
    const table: RawTable = {
      headers: ["time", "value"],
      rows: [["not-a-number", 1]]
    };

    const selection: MappingSelection = {
      firstRowIsHeader: true,
      timeColumnIndex: 0,
      valueColumnIndices: [1],
      experimentColumnIndex: null,
      replicateColumnIndex: null
    };

    const result = applyMappingToDataset({
      table,
      selection,
      fileName: "run.csv"
    });

    expect(result.dataset).toBeNull();
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].rowIndex).toBe(1);
  });
});
