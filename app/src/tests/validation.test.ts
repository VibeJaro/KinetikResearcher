import { describe, expect, it } from "vitest";
import type { Dataset, Experiment, Series } from "../lib/import/types";
import {
  buildValidationReport,
  checkConstantSignal,
  checkNanOrNonNumeric,
  checkNegativeValues,
  checkNoExperiments,
  checkTimeDuplicates,
  checkTimeNotMonotonic,
  checkTooFewPoints
} from "../lib/import/validation";

const createSeries = (overrides?: Partial<Series>): Series => ({
  id: "series-1",
  name: "Series 1",
  time: [0, 1, 2, 3, 4],
  y: [1, 2, 3, 4, 5],
  meta: {},
  ...overrides
});

const createExperiment = (overrides?: Partial<Experiment>): Experiment => ({
  id: "exp-1",
  name: "Experiment 1",
  series: [createSeries()],
  ...overrides
});

const createDataset = (overrides?: Partial<Dataset>): Dataset => ({
  id: "dataset-1",
  name: "Dataset 1",
  createdAt: new Date().toISOString(),
  experiments: [createExperiment()],
  audit: [],
  ...overrides
});

describe("validation checks", () => {
  it("flags non-monotonic time arrays", () => {
    const series = createSeries({ time: [0, 2, 1] });
    const finding = checkTimeNotMonotonic(series);
    expect(finding?.id).toBe("TIME_NOT_MONOTONIC");
    expect(finding?.severity).toBe("error");
  });

  it("flags duplicate time points", () => {
    const series = createSeries({ time: [0, 1, 1, 2, 3] });
    const finding = checkTimeDuplicates(series);
    expect(finding?.id).toBe("TIME_DUPLICATES");
    expect(finding?.severity).toBe("warn");
  });

  it("flags series with too few points", () => {
    const series = createSeries({ time: [0, 1, 2, 3], y: [1, 2, 3, 4] });
    const finding = checkTooFewPoints(series);
    expect(finding?.id).toBe("TOO_FEW_POINTS");
    expect(finding?.severity).toBe("warn");
  });

  it("flags dropped rows due to parse issues", () => {
    const series = createSeries({ meta: { droppedPoints: 2 } });
    const finding = checkNanOrNonNumeric(series);
    expect(finding?.id).toBe("NAN_OR_NONNUMERIC");
    expect(finding?.severity).toBe("warn");
  });

  it("flags negative values as info", () => {
    const series = createSeries({ y: [1, -1, 2, 3, 4] });
    const finding = checkNegativeValues(series);
    expect(finding?.id).toBe("NEGATIVE_VALUES");
    expect(finding?.severity).toBe("info");
  });

  it("flags constant signals", () => {
    const series = createSeries({ y: [2, 2, 2, 2, 2] });
    const finding = checkConstantSignal(series);
    expect(finding?.id).toBe("CONSTANT_SIGNAL");
    expect(finding?.severity).toBe("info");
  });

  it("flags datasets without experiments", () => {
    const dataset = createDataset({ experiments: [] });
    const finding = checkNoExperiments(dataset);
    expect(finding?.id).toBe("NO_EXPERIMENTS");
    expect(finding?.severity).toBe("error");
  });

  it("builds a report with summary counts", () => {
    const dataset = createDataset({
      experiments: [
        createExperiment({
          series: [
            createSeries({ time: [0, 1, 2, 3, 4], y: [1, 2, 3, 4, 5] }),
            createSeries({ time: [0, 1], y: [1, 1], meta: { droppedPoints: 1 } })
          ]
        })
      ]
    });
    const report = buildValidationReport(dataset);
    expect(report.summary.experiments).toBe(1);
    expect(report.summary.series).toBe(2);
    expect(report.summary.totalPoints).toBe(7);
    expect(report.summary.droppedPoints).toBe(1);
  });
});
