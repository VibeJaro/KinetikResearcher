import type { Dataset, Experiment, Series } from "./types";

export type ValidationSeverity = "info" | "warn" | "error";

export type ValidationStatus = "clean" | "needs-info" | "broken";

export type ValidationCode =
  | "TIME_NOT_MONOTONIC"
  | "TIME_DUPLICATES"
  | "TOO_FEW_POINTS"
  | "NAN_OR_NONNUMERIC"
  | "NEGATIVE_VALUES"
  | "CONSTANT_SIGNAL"
  | "NO_EXPERIMENTS";

export type ValidationFinding = {
  code: ValidationCode;
  severity: ValidationSeverity;
  message: string;
  experimentId?: string;
  experimentName?: string;
  seriesId?: string;
  seriesName?: string;
};

export type ValidationCounts = {
  experiments: number;
  series: number;
  points: number;
  droppedPoints: number;
};

export type ValidationReport = {
  status: ValidationStatus;
  counts: ValidationCounts;
  findings: ValidationFinding[];
};

const createSeriesFinding = (
  series: Series,
  experiment: Experiment,
  finding: Omit<ValidationFinding, "experimentId" | "experimentName" | "seriesId" | "seriesName">
): ValidationFinding => ({
  ...finding,
  experimentId: experiment.id,
  experimentName: experiment.name,
  seriesId: series.id,
  seriesName: series.name
});

const createDatasetFinding = (
  finding: Omit<ValidationFinding, "experimentId" | "experimentName" | "seriesId" | "seriesName">
): ValidationFinding => ({
  ...finding
});

const getDroppedPoints = (series: Series): number => {
  const raw = series.meta?.droppedPoints;
  return typeof raw === "number" && !Number.isNaN(raw) ? raw : 0;
};

const computeStandardDeviation = (values: number[]): number => {
  if (values.length === 0) {
    return 0;
  }
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance =
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
};

export const checkTimeNotMonotonic = (
  series: Series,
  experiment: Experiment
): ValidationFinding | null => {
  for (let index = 1; index < series.time.length; index += 1) {
    if (series.time[index] <= series.time[index - 1]) {
      return createSeriesFinding(series, experiment, {
        code: "TIME_NOT_MONOTONIC",
        severity: "error",
        message: "Time values are not strictly increasing."
      });
    }
  }
  return null;
};

export const checkTimeDuplicates = (
  series: Series,
  experiment: Experiment
): ValidationFinding | null => {
  const unique = new Set(series.time);
  if (unique.size !== series.time.length) {
    return createSeriesFinding(series, experiment, {
      code: "TIME_DUPLICATES",
      severity: "warn",
      message: "Duplicate time points detected."
    });
  }
  return null;
};

export const checkTooFewPoints = (
  series: Series,
  experiment: Experiment
): ValidationFinding | null => {
  if (series.time.length < 5) {
    return createSeriesFinding(series, experiment, {
      code: "TOO_FEW_POINTS",
      severity: "warn",
      message: "Fewer than five time points are available."
    });
  }
  return null;
};

export const checkNanOrNonNumeric = (
  series: Series,
  experiment: Experiment
): ValidationFinding | null => {
  const droppedPoints = getDroppedPoints(series);
  if (droppedPoints > 0) {
    return createSeriesFinding(series, experiment, {
      code: "NAN_OR_NONNUMERIC",
      severity: "warn",
      message: `${droppedPoints} rows were dropped due to parse issues.`
    });
  }
  return null;
};

export const checkNegativeValues = (
  series: Series,
  experiment: Experiment
): ValidationFinding | null => {
  if (series.y.some((value) => value < 0)) {
    return createSeriesFinding(series, experiment, {
      code: "NEGATIVE_VALUES",
      severity: "info",
      message: "Negative values are present in the signal."
    });
  }
  return null;
};

export const checkConstantSignal = (
  series: Series,
  experiment: Experiment
): ValidationFinding | null => {
  if (series.y.length < 2) {
    return null;
  }
  const stddev = computeStandardDeviation(series.y);
  if (stddev <= 1e-6) {
    return createSeriesFinding(series, experiment, {
      code: "CONSTANT_SIGNAL",
      severity: "info",
      message: "Signal is nearly constant across time."
    });
  }
  return null;
};

export const checkNoExperiments = (dataset: Dataset): ValidationFinding | null => {
  if (dataset.experiments.length === 0) {
    return createDatasetFinding({
      code: "NO_EXPERIMENTS",
      severity: "error",
      message: "No experiments were generated from mapping."
    });
  }
  return null;
};

export const getSeriesFindings = (
  series: Series,
  experiment: Experiment
): ValidationFinding[] => {
  const findings = [
    checkTimeNotMonotonic(series, experiment),
    checkTimeDuplicates(series, experiment),
    checkTooFewPoints(series, experiment),
    checkNanOrNonNumeric(series, experiment),
    checkNegativeValues(series, experiment),
    checkConstantSignal(series, experiment)
  ];
  return findings.filter((finding): finding is ValidationFinding => Boolean(finding));
};

export const getDatasetFindings = (dataset: Dataset): ValidationFinding[] => {
  const findings: ValidationFinding[] = [];
  const datasetFinding = checkNoExperiments(dataset);
  if (datasetFinding) {
    findings.push(datasetFinding);
  }

  dataset.experiments.forEach((experiment) => {
    experiment.series.forEach((series) => {
      findings.push(...getSeriesFindings(series, experiment));
    });
  });

  return findings;
};

export const getValidationCounts = (dataset: Dataset): ValidationCounts => {
  const experiments = dataset.experiments.length;
  const series = dataset.experiments.reduce(
    (sum, experiment) => sum + experiment.series.length,
    0
  );
  const points = dataset.experiments.reduce(
    (sum, experiment) =>
      sum + experiment.series.reduce((inner, series) => inner + series.time.length, 0),
    0
  );
  const droppedPoints = dataset.experiments.reduce(
    (sum, experiment) =>
      sum +
      experiment.series.reduce((inner, series) => inner + getDroppedPoints(series), 0),
    0
  );

  return {
    experiments,
    series,
    points,
    droppedPoints
  };
};

const resolveStatus = (findings: ValidationFinding[]): ValidationStatus => {
  if (findings.some((finding) => finding.severity === "error")) {
    return "broken";
  }
  if (findings.length > 0) {
    return "needs-info";
  }
  return "clean";
};

export const generateImportValidationReport = (dataset: Dataset): ValidationReport => {
  const findings = getDatasetFindings(dataset);
  return {
    status: resolveStatus(findings),
    counts: getValidationCounts(dataset),
    findings
  };
};
