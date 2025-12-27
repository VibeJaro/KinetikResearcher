import { describe, expect, it } from "vitest";
import type { Dataset, Experiment, Series } from "../lib/import/types";
import {
  checkConstantSignal,
  checkNanOrNonNumeric,
  checkNegativeValues,
  checkNoExperiments,
  checkTimeDuplicates,
  checkTimeNotMonotonic,
  checkTooFewPoints
} from "../lib/import/validation";
import { normalizeTimeToSeconds, type TimeColumnType } from "../lib/import/time";

const buildSeries = (overrides: Partial<Series> = {}): Series => ({
  id: "series-1",
  name: "Signal 1",
  time: [0, 1, 2, 3, 4],
  y: [1, 2, 3, 4, 5],
  ...overrides
});

const buildExperiment = (series: Series[]): Experiment => ({
  id: "exp-1",
  name: "Experiment 1",
  series,
  metaRaw: {},
  metaConsistency: {}
});

describe("import validation checks", () => {
  it("flags non-monotonic time", () => {
    const series = buildSeries({ time: [0, 2, 1, 3, 4] });
    const experiment = buildExperiment([series]);
    const finding = checkTimeNotMonotonic(series, experiment);
    expect(finding?.code).toBe("TIME_NOT_MONOTONIC");
    expect(finding?.severity).toBe("error");
  });

  it("flags duplicate time points", () => {
    const series = buildSeries({ time: [0, 1, 1, 2, 3] });
    const experiment = buildExperiment([series]);
    const finding = checkTimeDuplicates(series, experiment);
    expect(finding?.code).toBe("TIME_DUPLICATES");
    expect(finding?.severity).toBe("warn");
  });

  it("flags too few points", () => {
    const series = buildSeries({ time: [0, 1, 2, 3], y: [1, 1, 1, 1] });
    const experiment = buildExperiment([series]);
    const finding = checkTooFewPoints(series, experiment);
    expect(finding?.code).toBe("TOO_FEW_POINTS");
    expect(finding?.severity).toBe("warn");
  });

  it("flags dropped rows due to parse issues", () => {
    const series = buildSeries({ meta: { droppedPoints: 2 } });
    const experiment = buildExperiment([series]);
    const finding = checkNanOrNonNumeric(series, experiment);
    expect(finding?.code).toBe("NAN_OR_NONNUMERIC");
    expect(finding?.severity).toBe("warn");
  });

  it("flags negative values", () => {
    const series = buildSeries({ y: [1, -0.5, 2, 3, 4] });
    const experiment = buildExperiment([series]);
    const finding = checkNegativeValues(series, experiment);
    expect(finding?.code).toBe("NEGATIVE_VALUES");
    expect(finding?.severity).toBe("info");
  });

  it("flags constant signal", () => {
    const series = buildSeries({ y: [2, 2, 2, 2, 2] });
    const experiment = buildExperiment([series]);
    const finding = checkConstantSignal(series, experiment);
    expect(finding?.code).toBe("CONSTANT_SIGNAL");
    expect(finding?.severity).toBe("info");
  });

  it("keeps parsed numeric time values when normalizing to seconds", () => {
    const parsedTime = [0.25, 1.5, 2.75];
    const normalized = normalizeTimeToSeconds({
      time: parsedTime,
      timeType: "numeric" satisfies TimeColumnType
    });
    expect(normalized).toEqual(parsedTime);
  });

  it("normalizes datetime timestamps to relative seconds", () => {
    const base = Date.parse("2024-01-01T00:00:00Z");
    const timestamps = [base, base + 1000, base + 3500];
    const normalized = normalizeTimeToSeconds({
      time: timestamps,
      timeType: "datetime"
    });
    expect(normalized).toEqual([0, 1, 3.5]);
  });

  it("flags datasets with no experiments", () => {
    const dataset: Dataset = {
      id: "dataset-1",
      name: "Empty",
      createdAt: new Date().toISOString(),
      experiments: [],
      audit: []
    };
    const finding = checkNoExperiments(dataset);
    expect(finding?.code).toBe("NO_EXPERIMENTS");
    expect(finding?.severity).toBe("error");
  });
});
