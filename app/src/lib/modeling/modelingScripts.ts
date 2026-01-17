import type { DeviationAnalysisState } from "../../types/analysisState";
import type { Experiment } from "../../types/experiment";
import type {
  ModelingCandidate,
  ModelingDiagnostics,
  ModelingOptions,
  ModelingParameter,
  ModelingPreflight,
  ModelingPreflightCheck,
  ModelingScriptRun,
  ModelingVariantMetrics,
  ReactionNetworkState
} from "../../types/modeling";

const buildScriptRun = (
  scriptName: string,
  inputSummary: string,
  outputSummary: string
): ModelingScriptRun => ({
  scriptName,
  version: "v1",
  inputSummary,
  outputSummary,
  ranAt: new Date().toISOString()
});

const sumPoints = (experiments: Experiment[]): number =>
  experiments.reduce(
    (sum, experiment) =>
      sum +
      experiment.series.reduce((seriesSum, series) => seriesSum + series.time.length, 0),
    0
  );

export const validateModelingInputs = ({
  experiments,
  analysisState,
  networkState
}: {
  experiments: Experiment[];
  analysisState: DeviationAnalysisState;
  networkState: ReactionNetworkState;
}): { preflight: ModelingPreflight; audit: ModelingScriptRun } => {
  const selectedExperiments = experiments.filter(
    (experiment) => analysisState.fitSelection[experiment.experimentId] ?? true
  );
  const pointCount = sumPoints(selectedExperiments);
  const checks: ModelingPreflightCheck[] = [
    {
      id: "network-confirmed",
      title: "Reaktionsnetzwerk bestätigt",
      status: networkState.confirmed ? "ok" : "warning",
      detail: networkState.confirmed
        ? "Das Netzwerk wurde bestätigt."
        : "Netzwerk ist noch nicht bestätigt.",
      nextStep: networkState.confirmed
        ? "Keine Aktion erforderlich."
        : "Bitte Netzwerk prüfen und bestätigen."
    },
    {
      id: "network-edges",
      title: "Reaktionspfade vorhanden",
      status: networkState.edges.length > 0 ? "ok" : "fail",
      detail:
        networkState.edges.length > 0
          ? `${networkState.edges.length} Reaktionspfade definiert.`
          : "Es fehlen definierte Reaktionspfade.",
      nextStep:
        networkState.edges.length > 0
          ? "Netzwerkdetails prüfen."
          : "Mindestens einen Pfad hinzufügen."
    },
    {
      id: "experiments-selected",
      title: "Experimente für Fit ausgewählt",
      status: selectedExperiments.length > 0 ? "ok" : "fail",
      detail:
        selectedExperiments.length > 0
          ? `${selectedExperiments.length} Experimente ausgewählt.`
          : "Keine Experimente für den Fit gewählt.",
      nextStep:
        selectedExperiments.length > 0
          ? "Auswahl prüfen."
          : "Mindestens einen Versuch markieren."
    },
    {
      id: "data-volume",
      title: "Ausreichende Datenpunkte",
      status: pointCount >= 30 ? "ok" : "warning",
      detail:
        pointCount >= 30
          ? `${pointCount} Datenpunkte verfügbar.`
          : `Nur ${pointCount} Datenpunkte vorhanden.`,
      nextStep:
        pointCount >= 30
          ? "Fit kann gestartet werden."
          : "Erwäge zusätzliche Messpunkte oder vereinfachtes Modell."
    }
  ];

  const summary =
    checks.filter((check) => check.status === "fail").length > 0
      ? "Preflight hat Blocker: bitte offene Punkte beheben."
      : "Preflight abgeschlossen. Modellierung kann starten.";

  return {
    preflight: { checks, summary },
    audit: buildScriptRun(
      "validate_modeling_inputs",
      `${selectedExperiments.length} Experimente, ${pointCount} Punkte, ${networkState.edges.length} Kanten.`,
      summary
    )
  };
};

export const generateModelCandidates = ({
  networkState,
  options
}: {
  networkState: ReactionNetworkState;
  options: ModelingOptions;
}): { candidates: ModelingCandidate[]; audit: ModelingScriptRun } => {
  const baseCount = Math.max(networkState.edges.length, 1);
  const candidates: ModelingCandidate[] = [
    {
      id: "mass-action",
      label: "Massenwirkungsgesetz",
      family: "Massenwirkung",
      rationale: "Mechanistisch, gute Übertragbarkeit bei klaren Pfaden.",
      parameterCount: baseCount + (options.includeDeactivation ? 1 : 0),
      recommended: true,
      llmSummary:
        "Empfohlen, wenn du einen klaren Mechanismus hast und ein erklärbares Modell brauchst."
    },
    {
      id: "empirical",
      label: "Empirisches Potenzgesetz",
      family: "Empirisch",
      rationale: "Flexibel bei unklarem Mechanismus.",
      parameterCount: baseCount + 2,
      recommended: baseCount < 3,
      llmSummary: "Gut, wenn du schnelle Passung brauchst, aber weniger Mechanik erklären willst."
    },
    {
      id: "lhhw",
      label: "LHHW (Adsorption + Reaktion)",
      family: "LHHW",
      rationale: "Für heterogene Katalyse mit Adsorption/Inhibition.",
      parameterCount: baseCount + 3,
      recommended: false,
      llmSummary: "Sinnvoll bei katalytischen Oberflächen, benötigt meist mehr Parameter."
    }
  ];

  return {
    candidates,
    audit: buildScriptRun(
      "generate_model_candidates",
      `${networkState.edges.length} Kanten, Deaktivierung ${options.includeDeactivation ? "an" : "aus"}.`,
      `${candidates.length} Kandidaten erstellt.`
    )
  };
};

export const fitModelParameters = ({
  parameterCount,
  baseValue
}: {
  parameterCount: number;
  baseValue: number;
}): ModelingParameter[] => {
  return Array.from({ length: parameterCount }, (_, index) => {
    const value = Number((baseValue * (1 + index * 0.2)).toFixed(3));
    const min = Number((value * 0.2).toFixed(3));
    const max = Number((value * 3).toFixed(3));
    const uncertainty = Number((value * 0.15).toFixed(3));
    return {
      name: `k${index + 1}`,
      value,
      unit: "1/s",
      min,
      max,
      uncertainty,
      status: value > 0 ? "ok" : "review"
    };
  });
};

export const diagnosticsReport = ({
  metrics
}: {
  metrics: ModelingVariantMetrics;
}): ModelingDiagnostics => {
  const warnings: string[] = [];
  if (metrics.r2 < 0.9) {
    warnings.push("Fitqualität unter 0,90 – bitte Residuen prüfen.");
  }
  if (metrics.bic - metrics.aic > 8) {
    warnings.push("Starker Komplexitäts-Penalty (BIC >> AIC).");
  }

  const residualPattern =
    metrics.r2 > 0.95 ? "Residuen wirken zufällig verteilt." : "Leichter Trend in den Residuen.";

  return {
    residualPattern,
    warnings,
    recommendation:
      warnings.length === 0
        ? "Modell wirkt stabil. Fortfahren."
        : "Alternative Modellfamilie oder Zusatzannahmen prüfen.",
    llmSummary:
      warnings.length === 0
        ? "Die Residuen sehen unauffällig aus. Das Modell ist wahrscheinlich ok."
        : "Es gibt Hinweise auf systematische Abweichungen. Schau dir Alternativen an."
  };
};

export const buildComparisonSummary = ({
  metrics
}: {
  metrics: ModelingVariantMetrics[];
}): string => {
  const best = metrics.reduce((acc, current) => (current.aic < acc.aic ? current : acc));
  return `Bestes Modell anhand AIC: ${best.aic.toFixed(2)} (niedriger ist besser).`;
};
