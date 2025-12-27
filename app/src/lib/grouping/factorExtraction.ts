import type { Dataset, MetadataValue } from "../import/types";
import type {
  FactorCandidate,
  FactorExtractionPayload,
  FactorizedExperiment,
  FactorOverrideMap
} from "./types";

const chunk = <T,>(items: T[], size: number): T[][] => {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
};

const truncateFreeText = (value: MetadataValue, maxLength = 160): MetadataValue => {
  if (typeof value !== "string") {
    return value;
  }
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength)}…`;
};

export const buildFactorExtractionPayloads = ({
  dataset,
  selectedColumns,
  factorCandidates,
  batchSize = 30
}: {
  dataset: Dataset | null;
  selectedColumns: string[];
  factorCandidates: FactorCandidate[];
  batchSize?: number;
}): FactorExtractionPayload[] => {
  if (!dataset || dataset.experiments.length === 0 || selectedColumns.length === 0) {
    return [];
  }

  const experimentPayloads = dataset.experiments.map((experiment) => {
    const meta: Record<string, MetadataValue> = {};
    selectedColumns.forEach((column) => {
      if (column in experiment.metaRaw) {
        meta[column] = truncateFreeText(experiment.metaRaw[column]);
      }
    });
    return {
      experimentId: experiment.id,
      meta
    };
  });

  return chunk(experimentPayloads, batchSize).map((experiments) => ({
    factorCandidates,
    selectedColumns,
    experiments
  }));
};

export const mergeFactorBatches = (
  batches: FactorizedExperiment[][]
): FactorizedExperiment[] => {
  const merged: FactorizedExperiment[] = [];
  batches.forEach((batch) => merged.push(...batch));
  return merged;
};

export const applyOverridesToFactors = (
  factors: FactorizedExperiment[],
  overrides: FactorOverrideMap
): FactorizedExperiment[] =>
  factors.map((experiment) => {
    const overrideForExperiment = overrides[experiment.experimentId] ?? {};
    return {
      ...experiment,
      factors: experiment.factors.map((factor) => {
        const override = overrideForExperiment[factor.name];
        if (!override) {
          return factor;
        }
        return {
          ...factor,
          value: override.value
        };
      })
    };
  });
