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
  title: string;
  summary: string;
  hint?: string;
  technicalDetails?: string;
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
        title: "Time values go backwards",
        summary:
          "The time column decreases at least once. Kinetic analysis requires time values to increase steadily.",
        hint: "Sort or correct the time column for this series before continuing.",
        technicalDetails: "Code: TIME_NOT_MONOTONIC"
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
      title: "Duplicate time points",
      summary:
        "Two or more rows share the same time value. This can distort fits or averaging.",
      hint: "Consider averaging duplicates or removing extra rows.",
      technicalDetails: "Code: TIME_DUPLICATES"
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
      title: "Too few time points",
      summary:
        "This series contains fewer than five measurements, which limits kinetic fitting.",
      hint: "Collect more points or treat this series as qualitative.",
      technicalDetails: `Code: TOO_FEW_POINTS · Points: ${series.time.length}`
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
      title: "Invalid data points removed",
      summary:
        "Some rows contained text or empty values where numbers were expected. These rows were ignored during import.",
      hint: "Check the original file to ensure numeric values in time and signal columns.",
      technicalDetails: `Code: NAN_OR_NONNUMERIC · Dropped rows: ${droppedPoints}`
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
      title: "Negative signal values",
      summary:
        "Some signal values are below zero. This can be normal depending on baseline correction.",
      hint: "Confirm whether negative values are expected or if baseline needs adjustment.",
      technicalDetails: "Code: NEGATIVE_VALUES"
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
      title: "Signal is nearly constant",
      summary:
        "The signal changes very little over time, which may indicate no reaction or measurement issues.",
      hint: "Verify that the signal should change for this experiment.",
      technicalDetails: "Code: CONSTANT_SIGNAL"
    });
  }
  return null;
};

export const checkNoExperiments = (dataset: Dataset): ValidationFinding | null => {
  if (dataset.experiments.length === 0) {
    return createDatasetFinding({
      code: "NO_EXPERIMENTS",
      severity: "error",
      title: "No experiments created",
      summary: "The mapping did not produce any experiments from the uploaded file.",
      hint: "Review the experiment column or ensure rows contain data.",
      technicalDetails: "Code: NO_EXPERIMENTS"
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

export const resolveValidationStatus = (
  findings: ValidationFinding[]
): ValidationStatus => {
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
    status: resolveValidationStatus(findings),
    counts: getValidationCounts(dataset),
    findings
  };
};
