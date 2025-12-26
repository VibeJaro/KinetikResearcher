import type { Dataset, Experiment, Series } from "./types";

export type ValidationSeverity = "info" | "warn" | "error";

export type ValidationStatus = "clean" | "needs-info" | "broken";

export type ValidationCode =
  | "TIME_NOT_MONOTONIC"
  | "TIME_DUPLICATES"
  | "TIME_NOT_INTERPRETABLE"
  | "POSSIBLE_EXCEL_TIME"
  | "TOO_FEW_POINTS"
  | "NAN_OR_NONNUMERIC"
  | "NEGATIVE_VALUES"
  | "CONSTANT_SIGNAL"
  | "NO_EXPERIMENTS";

export type ValidationFinding = {
  code: ValidationCode;
  severity: ValidationSeverity;
  title: string;
  description: string;
  hint?: string;
  details?: {
    droppedPoints?: number;
    duplicateCount?: number;
    negativeCount?: number;
    pointCount?: number;
    timeIssueCount?: number;
  };
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
  datasetFindings: ValidationFinding[];
  experimentSummaries: {
    experimentId: string;
    experimentName: string;
    status: ValidationStatus;
    findings: ValidationFinding[];
  }[];
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

export const checkTimeInterpretability = (
  series: Series,
  experiment: Experiment
): ValidationFinding | null => {
  const detectedType = series.meta?.timeInfo?.detectedType;
  if (!detectedType || detectedType === "invalid") {
    return createSeriesFinding(series, experiment, {
      code: "TIME_NOT_INTERPRETABLE",
      severity: "error",
      title: "Time column not interpretable",
      description:
        "Time values could not be interpreted as numeric durations or timestamps. Kinetic validation cannot proceed without a valid time axis.",
      hint: "Check the time column for mixed formats or non-date strings and re-import."
    });
  }
  return null;
};

export const checkPossibleExcelTime = (
  series: Series,
  experiment: Experiment
): ValidationFinding | null => {
  const rawValues = series.meta?.timeInfo?.rawValues ?? series.time;
  const hasExcelLikeValues = rawValues.some((value) => {
    if (typeof value !== "number") {
      return false;
    }
    if (!Number.isFinite(value)) {
      return false;
    }
    const absoluteValue = Math.abs(value);
    const fractionalPart = Math.abs(value % 1);
    return absoluteValue > 1e4 && fractionalPart > 0;
  });

  if (hasExcelLikeValues) {
    return createSeriesFinding(series, experiment, {
      code: "POSSIBLE_EXCEL_TIME",
      severity: "warn",
      title: "Time values may be Excel dates",
      description:
        "Large numeric time values with fractions were detected and could be Excel date serials. Validation currently treats them using the chosen time unit.",
      hint: "If these are calendar dates, switch to datetime handling or convert them before import."
    });
  }
  return null;
};

export const checkTimeNotMonotonic = (
  series: Series,
  experiment: Experiment
): ValidationFinding | null => {
  let issueCount = 0;
  for (let index = 1; index < series.time.length; index += 1) {
    if (series.time[index] <= series.time[index - 1]) {
      issueCount += 1;
    }
  }
  if (issueCount > 0) {
    return createSeriesFinding(series, experiment, {
      code: "TIME_NOT_MONOTONIC",
      severity: "error",
      title: "Time values go backwards",
      description:
        "The time column is not strictly increasing at least once. This breaks kinetic analysis and must be fixed.",
      hint: "Sort or correct the time values so they only increase.",
      details: {
        timeIssueCount: issueCount
      }
    });
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
      description:
        "Some time values repeat within the series. This can confuse downstream fitting and rate calculations.",
      hint: "Remove duplicates or average repeated points before importing.",
      details: {
        duplicateCount: series.time.length - unique.size
      }
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
      description:
        "This series has very few measurements. Most kinetic models need more points to fit reliably.",
      hint: "Consider adding additional time points if possible.",
      details: {
        pointCount: series.time.length
      }
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
      description:
        "Some rows contained text or empty values where numbers were expected. These rows were ignored during import.",
      hint: "Review the raw file for missing or non-numeric entries.",
      details: {
        droppedPoints
      }
    });
  }
  return null;
};

export const checkNegativeValues = (
  series: Series,
  experiment: Experiment
): ValidationFinding | null => {
  const negativeCount = series.y.filter((value) => value < 0).length;
  if (negativeCount > 0) {
    return createSeriesFinding(series, experiment, {
      code: "NEGATIVE_VALUES",
      severity: "info",
      title: "Negative values detected",
      description:
        "Negative signal values are present. This can be expected after baseline correction, but can also indicate import issues.",
      hint: "Confirm whether negative values are expected for this assay.",
      details: {
        negativeCount
      }
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
      description:
        "The signal changes very little over time. Fitting will be unreliable without variation.",
      hint: "Check if this series should be excluded or reprocessed."
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
      description:
        "Mapping did not produce any experiments. Check that the time and value columns contain data.",
      hint: "Verify the selected columns and ensure the file has data rows."
    });
  }
  return null;
};

export const getSeriesFindings = (
  series: Series,
  experiment: Experiment
): ValidationFinding[] => {
  const findings = [
    checkTimeInterpretability(series, experiment),
    checkPossibleExcelTime(series, experiment),
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
  const datasetFinding = checkNoExperiments(dataset);
  return datasetFinding ? [datasetFinding] : [];
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

export const resolveStatus = (findings: ValidationFinding[]): ValidationStatus => {
  if (findings.some((finding) => finding.severity === "error")) {
    return "broken";
  }
  if (findings.length > 0) {
    return "needs-info";
  }
  return "clean";
};

export const generateImportValidationReport = (dataset: Dataset): ValidationReport => {
  const datasetFindings = getDatasetFindings(dataset);
  const experimentSummaries = dataset.experiments.map((experiment) => {
    const findings = experiment.series.flatMap((series) =>
      getSeriesFindings(series, experiment)
    );
    return {
      experimentId: experiment.id,
      experimentName: experiment.name,
      status: resolveStatus(findings),
      findings
    };
  });
  const findings = [
    ...datasetFindings,
    ...experimentSummaries.flatMap((summary) => summary.findings)
  ];
  return {
    status: resolveStatus(findings),
    counts: getValidationCounts(dataset),
    datasetFindings,
    experimentSummaries
  };
};
