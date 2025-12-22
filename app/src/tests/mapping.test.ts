import { describe, expect, it } from "vitest";
import {
  applyMappingToDataset,
  parseNumericValue,
  type MappingSelection
} from "../lib/import/mapping";
import type { RawTable } from "../lib/import/types";

describe("mapping", () => {
  it("groups rows into experiments and series", () => {
    const table: RawTable = {
      headers: ["time", "signal", "experiment"],
      rows: [
        [0, 1.2, "A"],
        [1, 1.4, "A"],
        [0, 2.5, "B"]
      ]
    };

    const selection: MappingSelection = {
      useFirstRowAsHeader: true,
      timeColumn: "time",
      valueColumns: ["signal"],
      experimentColumn: "experiment",
      replicateColumn: null
    };

    const result = applyMappingToDataset(table, selection, "test.csv");

    expect(result.errors).toEqual([]);
    expect(result.summary).toEqual({ experiments: 2, series: 2, points: 3 });
    expect(result.dataset.experiments).toHaveLength(2);
    const experimentNames = result.dataset.experiments.map((experiment) => experiment.name);
    expect(experimentNames).toEqual(["A", "B"]);
    result.dataset.experiments.forEach((experiment) => {
      expect(experiment.series).toHaveLength(1);
    });
  });

  it("parses numeric values with comma decimal", () => {
    expect(parseNumericValue("1,5")).toBeCloseTo(1.5);
    expect(parseNumericValue(" 2.0 ")).toBeCloseTo(2.0);
    expect(parseNumericValue("bad")).toBeNull();
    expect(parseNumericValue(3.2)).toBeCloseTo(3.2);
  });

  it("flags rows with non-numeric time values", () => {
    const table: RawTable = {
      headers: ["time", "value"],
      rows: [
        [0, 10],
        ["bad", 12],
        [2, 14]
      ]
    };

    const selection: MappingSelection = {
      useFirstRowAsHeader: true,
      timeColumn: "time",
      valueColumns: ["value"],
      experimentColumn: null,
      replicateColumn: null
    };

    const result = applyMappingToDataset(table, selection);

    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.summary.points).toBe(2);
  });
});
