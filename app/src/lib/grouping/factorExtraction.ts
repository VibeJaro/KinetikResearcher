import type {
  FactorExtractionRequest,
  FactorExtractionResponse,
  FactorValue,
  ResolvedFactor
} from "./types";

export const emptyFactorExtractionResponse: FactorExtractionResponse = {
  experiments: []
};

export const mergeOverrides = (
  response: FactorExtractionResponse,
  overrides: Record<string, Record<string, { value: string | number | null; note?: string }>>
): Record<string, ResolvedFactor[]> => {
  const table: Record<string, ResolvedFactor[]> = {};

  response.experiments.forEach((experiment) => {
    const overrideForExperiment = overrides[experiment.experimentId] ?? {};
    table[experiment.experimentId] = experiment.factors.map((factor) => {
      const override = overrideForExperiment[factor.name];
      if (!override) {
        return factor;
      }
      return {
        ...factor,
        override
      } satisfies ResolvedFactor;
    });
  });

  return table;
};

export const toRequestBatches = (
  request: FactorExtractionRequest,
  batchSize: number
): FactorExtractionRequest[] => {
  const batches: FactorExtractionRequest[] = [];
  for (let index = 0; index < request.experiments.length; index += batchSize) {
    const slice = request.experiments.slice(index, index + batchSize);
    batches.push({
      ...request,
      experiments: slice
    });
  }
  return batches;
};

export const dedupeFactors = (factors: FactorValue[]): FactorValue[] => {
  const seen = new Set<string>();
  return factors.filter((factor) => {
    const key = `${factor.name}::${factor.value}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
};
