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
  experimentId: experiment.experimentId,
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
      title: "Zeitwerte fallen zurück",
      description:
        "Mindestens ein Zeitstempel ist kleiner oder gleich dem vorherigen. So lässt sich die Kinetik nicht sicher berechnen.",
      hint: "Zeitspalte sortieren oder fehlerhafte Zeilen entfernen, bis die Zeit nur noch steigt.",
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
      title: "Doppelte Zeitpunkte",
      description:
        "Mehrere Zeilen besitzen denselben Zeitwert. Das kann Fits und Ratenberechnung verzerren.",
      hint: "Doppelte Zeitpunkte zusammenführen oder vor dem Import mitteln.",
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
      title: "Zu wenige Messpunkte",
      description:
        "Diese Reihe hat sehr wenige Messungen. Die meisten Modelle brauchen mehr Stützstellen.",
      hint: "Falls möglich zusätzliche Messpunkte erfassen oder die Reihe nur als Trend nutzen.",
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
      title: "Ungültige Datenpunkte entfernt",
      description:
        "Einige Zeilen enthielten Text oder Leerwerte statt Zahlen und wurden beim Import ignoriert.",
      hint: "Rohdatei kurz prüfen und fehlende Werte ergänzen oder korrigieren.",
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
      title: "Negative Werte erkannt",
      description:
        "Negative Signalwerte sind vorhanden. Nach einer Basislinienkorrektur ist das okay, sonst Hinweis auf Importfehler.",
      hint: "Bitte kurz bestätigen, ob negative Werte in Ordnung sind.",
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
      title: "Signal fast konstant",
      description:
        "Das Signal ändert sich kaum über die Zeit. Ein Fit wäre ohne Streuung unsicher.",
      hint: "Prüfen, ob die Reihe ausgeschlossen oder nachbearbeitet werden soll."
    });
  }
  return null;
};

export const checkNoExperiments = (dataset: Dataset): ValidationFinding | null => {
  if (dataset.experiments.length === 0) {
    return createDatasetFinding({
      code: "NO_EXPERIMENTS",
      severity: "error",
      title: "Keine Experimente erzeugt",
      description:
        "Das Mapping hat keine Experimente ergeben. Zeit- oder Wertespalten könnten leer sein.",
      hint: "Spaltenwahl prüfen und sicherstellen, dass die Datei Datenzeilen enthält."
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
  const datasetFindings = getDatasetFindings(dataset);
  const experimentSummaries = dataset.experiments.map((experiment) => {
    const findings = experiment.series.flatMap((series) =>
      getSeriesFindings(series, experiment)
    );
    const experimentName = experiment.name ?? "Unbenanntes Experiment";
    return {
      experimentId: experiment.experimentId,
      experimentName,
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
