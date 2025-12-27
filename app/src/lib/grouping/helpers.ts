import type { Dataset, Experiment } from "../import/types";
import type {
  ColumnSummary,
  ExtractedFactor,
  FactorExtractionExperiment,
  FactorExtractionResult,
  FactorOverrides,
  GroupingRecipe,
  GroupingRecipeGroup
} from "./types";

const truncateValue = (value: string | number): string | number => {
  if (typeof value === "number") {
    return value;
  }
  const trimmed = value.trim();
  if (trimmed.length <= 120) {
    return trimmed;
  }
  return `${trimmed.slice(0, 117)}...`;
};

const inferTypeHeuristic = (values: (string | number)[]): "text" | "numeric" => {
  if (values.length === 0) {
    return "text";
  }
  const numericCount = values.filter((value) => typeof value === "number").length;
  return numericCount / values.length >= 0.6 ? "numeric" : "text";
};

export const summarizeMetadataColumns = (dataset: Dataset | null): ColumnSummary[] => {
  if (!dataset) {
    return [];
  }
  const columnMap = new Map<
    string,
    { nonNull: number; values: (string | number)[]; total: number }
  >();

  const experimentCount = dataset.experiments.length || 1;

  dataset.experiments.forEach((experiment) => {
    const meta = experiment.meta?.metaRaw ?? {};
    const keys = Object.keys(meta);
    keys.forEach((key) => {
      const existing = columnMap.get(key) ?? { nonNull: 0, values: [], total: 0 };
      const value = meta[key];
      const next = { ...existing, total: existing.total + 1 };
      if (value !== null && value !== undefined && value !== "") {
        next.nonNull += 1;
        if (next.values.length < 8) {
          next.values.push(truncateValue(value));
        }
      }
      columnMap.set(key, next);
    });
  });

  return Array.from(columnMap.entries()).map(([name, data]) => ({
    name,
    typeHeuristic: inferTypeHeuristic(data.values),
    nonNullRatio: data.total === 0 ? 0 : data.nonNull / experimentCount,
    examples: data.values
  }));
};

const createId = (prefix: string): string =>
  `${prefix}-${Math.random().toString(36).slice(2, 10)}`;

const getFinalFactorValue = (
  experimentId: string,
  factorName: string,
  overrides: FactorOverrides,
  extracted: ExtractedFactor[]
): string | number | null => {
  const overriddenValue = overrides[experimentId]?.[factorName];
  if (overriddenValue !== undefined) {
    return overriddenValue;
  }
  const match = extracted.find((factor) => factor.name === factorName);
  return match ? match.value : null;
};

const signatureFromFactors = (
  experiment: FactorExtractionExperiment,
  factorNames: string[],
  overrides: FactorOverrides
): Record<string, string | number | null> => {
  const signature: Record<string, string | number | null> = {};
  factorNames.forEach((name) => {
    const value = getFinalFactorValue(experiment.experimentId, name, overrides, experiment.factors);
    if (value !== undefined) {
      signature[name] = value ?? null;
    }
  });
  return signature;
};

const binTemperature = (value: string | number | null): string | null => {
  const numeric = typeof value === "number" ? value : Number(value);
  if (Number.isNaN(numeric)) {
    return null;
  }
  if (numeric < 30) {
    return "<30°C";
  }
  if (numeric < 60) {
    return "30–59°C";
  }
  if (numeric < 90) {
    return "60–89°C";
  }
  return "90°C+";
};

const createGroupingFromFactors = ({
  experiments,
  factorNames,
  keyFactors,
  overrides,
  recipeId,
  description
}: {
  experiments: FactorExtractionExperiment[];
  factorNames: string[];
  keyFactors: string[];
  overrides: FactorOverrides;
  recipeId: string;
  description: string;
}): GroupingRecipe => {
  const groups = new Map<string, GroupingRecipeGroup>();

  experiments.forEach((experiment) => {
    const signature: Record<string, string | number | null> = {};
    keyFactors.forEach((factorName) => {
      let value: string | number | null;
      if (factorName === "temperature-bin") {
        const rawValue = getFinalFactorValue(
          experiment.experimentId,
          "temperature",
          overrides,
          experiment.factors
        );
        value = binTemperature(rawValue);
      } else {
        value = getFinalFactorValue(experiment.experimentId, factorName, overrides, experiment.factors);
      }
      signature[factorName] = value ?? null;
    });
    const key = keyFactors.map((factor) => `${factor}:${signature[factor] ?? "missing"}`).join("|");
    const group = groups.get(key) ?? {
      groupId: createId("group"),
      signature,
      experimentIds: [],
      warning: null
    };
    group.experimentIds.push(experiment.experimentId);
    groups.set(key, group);
  });

  const groupList = Array.from(groups.values()).map((group) => {
    const relevantFactors = keyFactors.filter((factor) => factor !== "temperature-bin");
    const missingFactors = relevantFactors.filter(
      (factor) => group.signature[factor] === null || group.signature[factor] === undefined
    );
    const warning =
      missingFactors.length > 0
        ? `Missing factor values: ${missingFactors.join(", ")}`
        : null;
    return { ...group, warning };
  });

  return {
    recipeId,
    description,
    groups: groupList
  };
};

const groupHasMixedFactors = (
  group: GroupingRecipeGroup,
  experiments: FactorExtractionExperiment[],
  factorNames: string[],
  overrides: FactorOverrides
): boolean => {
  const experimentIds = new Set(group.experimentIds);
  const observed: Record<string, string | number | null> = {};
  experiments
    .filter((experiment) => experimentIds.has(experiment.experimentId))
    .forEach((experiment) => {
      factorNames.forEach((factorName) => {
        const value = getFinalFactorValue(
          experiment.experimentId,
          factorName,
          overrides,
          experiment.factors
        );
        if (!(factorName in observed)) {
          observed[factorName] = value ?? null;
        } else if (observed[factorName] !== value) {
          observed[factorName] = "MIXED";
        }
      });
    });
  return Object.values(observed).some((value) => value === "MIXED");
};

export const buildGroupingOptions = (
  result: FactorExtractionResult | null,
  overrides: FactorOverrides
): GroupingRecipe[] => {
  if (!result) {
    return [];
  }
  const { experiments, factorNames } = result;
  if (experiments.length === 0) {
    return [];
  }

  const options: GroupingRecipe[] = [];
  const canonicalOptions: Array<{ id: string; description: string; factors: string[] }> = [
    { id: "by-catalyst", description: "Group by catalyst", factors: ["catalyst"] },
    {
      id: "by-catalyst-additive",
      description: "Group by catalyst + additive",
      factors: ["catalyst", "additive"]
    },
    {
      id: "by-substrate-catalyst",
      description: "Group by substrate + catalyst",
      factors: ["substrate", "catalyst"]
    },
    {
      id: "by-temperature-bin",
      description: "Group by temperature bins",
      factors: ["temperature-bin"]
    }
  ];

  canonicalOptions.forEach((option) => {
    const available = option.factors.some((factor) =>
      factor === "temperature-bin" ? factorNames.includes("temperature") : factorNames.includes(factor)
    );
    if (!available) {
      return;
    }
    options.push(
      createGroupingFromFactors({
        experiments,
        factorNames,
        keyFactors: option.factors,
        overrides,
        recipeId: option.id,
        description: option.description
      })
    );
  });

  return options;
};

export const deriveManualGroupSignatures = (
  groups: GroupingRecipeGroup[],
  result: FactorExtractionResult | null,
  overrides: FactorOverrides
): GroupingRecipeGroup[] => {
  if (!result) {
    return groups;
  }
  const { factorNames, experiments } = result;
  return groups.map((group) => {
    const experimentEntities = experiments.filter((exp) =>
      group.experimentIds.includes(exp.experimentId)
    );
    const signature: Record<string, string | number | null> = {};
    factorNames.forEach((factorName) => {
      const values = experimentEntities.map((exp) =>
        getFinalFactorValue(exp.experimentId, factorName, overrides, exp.factors)
      );
      const unique = Array.from(new Set(values.map((value) => value ?? null)));
      signature[factorName] =
        unique.length === 1 ? unique[0] : unique.length === 0 ? null : "(mixed)";
    });
    const warning = groupHasMixedFactors(group, experiments, factorNames, overrides)
      ? "Mixed/conflicting factors"
      : group.warning ?? null;
    return { ...group, signature, warning };
  });
};

export const toManualGroupsFromRecipe = (
  recipe: GroupingRecipe,
  existing?: GroupingRecipeGroup[]
): GroupingRecipeGroup[] => {
  return recipe.groups.map((group, index) => ({
    ...group,
    groupId: group.groupId || createId("group"),
    name: `Group ${index + 1}`,
    createdFromRecipe: recipe.recipeId
  }));
};

export const attachExperimentMetaDefaults = (experiments: Experiment[]): Experiment[] =>
  experiments.map((experiment) => ({
    ...experiment,
    meta: experiment.meta ?? { metaRaw: {}, metaConsistency: {} }
  }));
