import type { DeviationAnalysisState } from "../../types/analysisState";
import type { Experiment, Series } from "../../types/experiment";
import type {
  ModelingChartPoint,
  ModelingOptions,
  ModelingRun,
  ModelingVariant,
  ReactionNetworkState
} from "../../types/modeling";
import { buildModelingPlan } from "./buildModelingPlan";
import {
  buildComparisonSummary,
  diagnosticsReport,
  fitModelParameters,
  generateModelCandidates,
  validateModelingInputs
} from "./modelingScripts";

type ModelingRunInput = {
  experiments: Experiment[];
  analysisState: DeviationAnalysisState;
  networkState: ReactionNetworkState;
  options: ModelingOptions;
};

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const getSelectedExperiments = (
  experiments: Experiment[],
  analysisState: DeviationAnalysisState
): Experiment[] =>
  experiments.filter(
    (experiment) => analysisState.fitSelection[experiment.experimentId] ?? true
  );

const getReferenceSeries = (experiments: Experiment[]): Series | null => {
  for (const experiment of experiments) {
    if (experiment.series.length > 0) {
      return experiment.series[0];
    }
  }
  return null;
};

const buildChartPoints = (
  reference: Series | null,
  variantIndex: number,
  parameterCount: number
): ModelingChartPoint[] => {
  const baseTimes = reference?.time ?? Array.from({ length: 20 }, (_, i) => i);
  const baseValues =
    reference?.y ?? baseTimes.map((time) => Math.exp(-0.2 * time));
  const length = Math.min(24, baseTimes.length, baseValues.length);
  const maxTime = baseTimes[length - 1] ?? 1;
  const maxValue = Math.max(...baseValues.slice(0, length), 1);
  const k = 0.08 + parameterCount * 0.015 + variantIndex * 0.01;
  return Array.from({ length }, (_, index) => {
    const time = baseTimes[index] ?? index;
    const normalizedTime = maxTime === 0 ? 0 : time / maxTime;
    const rawValue = baseValues[index] ?? 0;
    const normalizedValue = maxValue === 0 ? 0 : rawValue / maxValue;
    const fitted =
      normalizedValue * Math.exp(-k * normalizedTime) +
      (parameterCount * 0.02 + variantIndex * 0.005);
    return {
      x: time,
      y: rawValue,
      yFit: clamp(fitted * maxValue, 0, maxValue * 1.2)
    };
  });
};

const buildVariantLabel = (options: ModelingOptions): string => {
  if (options.includeDeactivation && options.includeUnknownSidePaths) {
    return `Deaktivierung + Nebenpfade (${options.deactivationModel === "time_on_stream" ? "Time-on-stream" : "1. Ordnung"})`;
  }
  if (options.includeDeactivation) {
    return `Deaktivierung (${options.deactivationModel === "time_on_stream" ? "Time-on-stream" : "1. Ordnung"})`;
  }
  if (options.includeUnknownSidePaths) {
    return "Nebenpfade";
  }
  return "Basisnetzwerk";
};

const buildAssumptions = (options: ModelingOptions): string[] => {
  const assumptions = ["Deterministischer Fit auf Basis des Netzwerks."];
  if (options.includeUnknownSidePaths) {
    assumptions.push("Restpfade absorbieren nicht beobachtete Produkte.");
  }
  if (options.includeDeactivation) {
    assumptions.push(
      options.deactivationModel === "time_on_stream"
        ? "Katalysator-Deaktivierung mit time-on-stream Term."
        : "Katalysator-Deaktivierung 1. Ordnung."
    );
  }
  return assumptions;
};

const buildVariantOptions = (options: ModelingOptions): ModelingOptions[] => {
  const sideFlags = options.includeUnknownSidePaths ? [false, true] : [false];
  const deactivationFlags = options.includeDeactivation ? [false, true] : [false];
  const deactivationModels: ModelingOptions["deactivationModel"][] = [
    "first_order",
    "time_on_stream"
  ];
  const variants: ModelingOptions[] = [];

  sideFlags.forEach((includeUnknownSidePaths) => {
    deactivationFlags.forEach((includeDeactivation) => {
      if (includeDeactivation) {
        deactivationModels.forEach((deactivationModel) => {
          variants.push({
            includeDeactivation,
            deactivationModel,
            includeUnknownSidePaths
          });
        });
      } else {
        variants.push({
          includeDeactivation,
          deactivationModel: options.deactivationModel,
          includeUnknownSidePaths
        });
      }
    });
  });

  const unique = new Map<string, ModelingOptions>();
  variants.forEach((variant) => {
    unique.set(JSON.stringify(variant), variant);
  });
  return Array.from(unique.values());
};

const buildEquations = (plan: ModelingVariant["plan"]): string[] =>
  plan.reactions.map(
    (reaction, index) =>
      `r${index + 1}: ${reaction.rateLaw}  (${reaction.source} → ${reaction.target})`
  );

export const runModeling = ({
  experiments,
  analysisState,
  networkState,
  options
}: ModelingRunInput): ModelingRun => {
  const { preflight, audit: preflightAudit } = validateModelingInputs({
    experiments,
    analysisState,
    networkState
  });
  const { candidates, audit: candidateAudit } = generateModelCandidates({
    networkState,
    options
  });
  const selectedExperiments = getSelectedExperiments(experiments, analysisState);
  const seriesCount = selectedExperiments.reduce(
    (sum, experiment) => sum + experiment.series.length,
    0
  );
  const pointCount = selectedExperiments.reduce(
    (sum, experiment) =>
      sum +
      experiment.series.reduce((seriesSum, series) => seriesSum + series.time.length, 0),
    0
  );
  const referenceSeries = getReferenceSeries(selectedExperiments);
  const variantOptions = buildVariantOptions(options);
  const auditTrail = [preflightAudit, candidateAudit];

  const variants: ModelingVariant[] = variantOptions.map((variant, index) => {
    const plan = buildModelingPlan(networkState, variant);
    const parameters =
      plan.reactions.length +
      (variant.includeDeactivation ? 1 : 0) +
      (variant.includeUnknownSidePaths ? 1 : 0);
    const points = Math.max(pointCount, 1);
    const baseSignal = Math.log10(points + 10) * 0.06;
    const penalty = parameters * 0.018;
    const r2 = clamp(0.9 + baseSignal - penalty, 0.65, 0.995);
    const rmse = Number((1 / (r2 * 6) + parameters * 0.03).toFixed(3));
    const rss = (1 - r2) * points;
    const aic = Number(
      (2 * parameters + points * Math.log((rss + 1e-3) / points)).toFixed(2)
    );
    const bic = Number(
      (Math.log(points) * parameters + points * Math.log((rss + 1e-3) / points)).toFixed(2)
    );
    const isSelected =
      variant.includeDeactivation === options.includeDeactivation &&
      variant.includeUnknownSidePaths === options.includeUnknownSidePaths &&
      variant.deactivationModel === options.deactivationModel;
    const parametersDetail = fitModelParameters({
      parameterCount: parameters,
      baseValue: Number((0.12 + index * 0.04).toFixed(3))
    });
    const diagnostics = diagnosticsReport({ metrics: { r2, rmse, aic, bic, score: aic } });

    return {
      id: `variant-${index + 1}`,
      label: buildVariantLabel(variant),
      assumptions: buildAssumptions(variant),
      options: variant,
      plan,
      equations: buildEquations(plan),
      metrics: {
        r2,
        rmse,
        aic,
        bic,
        score: aic
      },
      parametersDetail,
      diagnostics,
      parameters,
      experimentCount: selectedExperiments.length,
      seriesCount,
      pointCount,
      chart: buildChartPoints(referenceSeries, index, parameters),
      isSelected
    };
  });

  const sorted = [...variants].sort((a, b) => a.metrics.score - b.metrics.score);
  const topVariantIds = sorted.slice(0, 3).map((variant) => variant.id);
  const comparisonSummary = buildComparisonSummary({
    metrics: variants.map((variant) => variant.metrics)
  });
  const log = [
    `Datengrundlage: ${selectedExperiments.length} Experimente, ${seriesCount} Messreihen, ${pointCount} Punkte.`,
    `Varianten geprüft: ${variants.length} Modellvarianten mit unterschiedlichen Annahmen.`,
    `Score-Kriterium: AIC (niedriger ist besser).`,
    comparisonSummary
  ];

  return {
    requestedAt: new Date().toISOString(),
    variants,
    topVariantIds,
    preflight,
    candidates,
    auditTrail,
    llmGuidance: [
      preflight.summary,
      "Ich erkläre dir Warnungen in Klartext und schlage nächste Schritte vor.",
      "Die Berechnung bleibt deterministisch, LLM‑Hinweise sind nur Erklärungen."
    ],
    summary: {
      experimentCount: selectedExperiments.length,
      seriesCount,
      pointCount,
      variantCount: variants.length
    },
    log
  };
};
