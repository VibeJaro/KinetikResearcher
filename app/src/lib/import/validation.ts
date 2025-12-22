import type { Dataset, Experiment, Series } from "./types";

export type ValidationSeverity = "info" | "warn" | "error";
export type ValidationStatus = "clean" | "needs-info" | "broken";

export type ValidationFinding = {
  id: string;
  severity: ValidationSeverity;
  message: string;
  experimentId?: string;
  experimentName?: string;
  seriesId?: string;
  seriesName?: string;
};

export type ValidationSummary = {
  experiments: number;
  series: number;
  totalPoints: number;
  droppedPoints: number;
};

export type ValidationReport = {
  status: ValidationStatus;
  summary: ValidationSummary;
  findings: ValidationFinding[];
};

const getDroppedPoints = (series: Series): number => {
  const value = series.meta?.droppedPoints;
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
};

export const checkNoExperiments = (dataset: Dataset): ValidationFinding | null => {
  if (dataset.experiments.length > 0) {
    return null;
  }
  return {
    id: "NO_EXPERIMENTS",
    severity: "error",
    message: "No experiments were created from the mapping."
  };
};

export const checkTimeNotMonotonic = (
  series: Series,
  context?: { experiment?: Experiment }
): ValidationFinding | null => {
  const { time } = series;
  for (let index = 1; index < time.length; index += 1) {
    if (time[index] <= time[index - 1]) {
      return {
        id: "TIME_NOT_MONOTONIC",
        severity: "error",
        message: `${series.name} time values are not strictly increasing.`,
        experimentId: context?.experiment?.id,
        experimentName: context?.experiment?.name,
        seriesId: series.id,
        seriesName: series.name
      };
    }
  }
  return null;
};

export const checkTimeDuplicates = (
  series: Series,
  context?: { experiment?: Experiment }
): ValidationFinding | null => {
  const seen = new Set<number>();
  for (const value of series.time) {
    if (seen.has(value)) {
      return {
        id: "TIME_DUPLICATES",
        severity: "warn",
        message: `${series.name} contains duplicate time points.`,
        experimentId: context?.experiment?.id,
        experimentName: context?.experiment?.name,
        seriesId: series.id,
        seriesName: series.name
      };
    }
    seen.add(value);
  }
  return null;
};

export const checkTooFewPoints = (
  series: Series,
  context?: { experiment?: Experiment }
): ValidationFinding | null => {
  if (series.time.length >= 5) {
    return null;
  }
  return {
    id: "TOO_FEW_POINTS",
    severity: "warn",
    message: `${series.name} has fewer than 5 points.`,
    experimentId: context?.experiment?.id,
    experimentName: context?.experiment?.name,
    seriesId: series.id,
    seriesName: series.name
  };
};

export const checkNanOrNonNumeric = (
  series: Series,
  context?: { experiment?: Experiment }
): ValidationFinding | null => {
  const droppedPoints = getDroppedPoints(series);
  if (droppedPoints === 0) {
    return null;
  }
  return {
    id: "NAN_OR_NONNUMERIC",
    severity: "warn",
    message: `${series.name} dropped ${droppedPoints} rows due to parse issues.`,
    experimentId: context?.experiment?.id,
    experimentName: context?.experiment?.name,
    seriesId: series.id,
    seriesName: series.name
  };
};

export const checkNegativeValues = (
  series: Series,
  context?: { experiment?: Experiment }
): ValidationFinding | null => {
  if (!series.y.some((value) => value < 0)) {
    return null;
  }
  return {
    id: "NEGATIVE_VALUES",
    severity: "info",
    message: `${series.name} includes negative values.`,
    experimentId: context?.experiment?.id,
    experimentName: context?.experiment?.name,
    seriesId: series.id,
    seriesName: series.name
  };
};

export const checkConstantSignal = (
  series: Series,
  context?: { experiment?: Experiment }
): ValidationFinding | null => {
  if (series.y.length < 2) {
    return null;
  }
  const mean = series.y.reduce((sum, value) => sum + value, 0) / series.y.length;
  const variance =
    series.y.reduce((sum, value) => sum + (value - mean) ** 2, 0) / series.y.length;
  if (Math.sqrt(variance) > 1e-8) {
    return null;
  }
  return {
    id: "CONSTANT_SIGNAL",
    severity: "info",
    message: `${series.name} is nearly constant.`,
    experimentId: context?.experiment?.id,
    experimentName: context?.experiment?.name,
    seriesId: series.id,
    seriesName: series.name
  };
};

const resolveStatus = (findings: ValidationFinding[]): ValidationStatus => {
  if (findings.some((finding) => finding.severity === "error")) {
    return "broken";
  }
  if (findings.some((finding) => finding.severity === "warn")) {
    return "needs-info";
  }
  return "clean";
};

const buildSummary = (dataset: Dataset): ValidationSummary => {
  const experiments = dataset.experiments.length;
  const series = dataset.experiments.reduce(
    (sum, experiment) => sum + experiment.series.length,
    0
  );
  const totalPoints = dataset.experiments.reduce(
    (sum, experiment) =>
      sum + experiment.series.reduce((inner, seriesItem) => inner + seriesItem.time.length, 0),
    0
  );
  const droppedPoints = dataset.experiments.reduce(
    (sum, experiment) =>
      sum +
      experiment.series.reduce(
        (inner, seriesItem) => inner + getDroppedPoints(seriesItem),
        0
      ),
    0
  );
  return { experiments, series, totalPoints, droppedPoints };
};

export const buildValidationReport = (dataset: Dataset): ValidationReport => {
  const findings: ValidationFinding[] = [];
  const datasetFinding = checkNoExperiments(dataset);
  if (datasetFinding) {
    findings.push(datasetFinding);
  }

  dataset.experiments.forEach((experiment) => {
    experiment.series.forEach((series) => {
      const context = { experiment };
      const checks = [
        checkTimeNotMonotonic(series, context),
        checkTimeDuplicates(series, context),
        checkTooFewPoints(series, context),
        checkNanOrNonNumeric(series, context),
        checkNegativeValues(series, context),
        checkConstantSignal(series, context)
      ];
      checks.forEach((finding) => {
        if (finding) {
          findings.push(finding);
        }
      });
    });
  });

  return {
    status: resolveStatus(findings),
    summary: buildSummary(dataset),
    findings
  };
};
