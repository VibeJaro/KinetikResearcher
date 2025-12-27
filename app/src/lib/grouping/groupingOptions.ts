import type {
  FactorizedExperiment,
  FactorOverrideMap,
  GroupDefinition,
  GroupingOption
} from "./types";

const createGroupId = (recipeId: string, index: number): string =>
  `group-${recipeId}-${index + 1}`;

const normalizeValue = (value: unknown): string | number | null => {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  const trimmed = String(value).trim();
  return trimmed.length === 0 ? null : trimmed;
};

const applyOverrides = (
  experiments: FactorizedExperiment[],
  overrides: FactorOverrideMap
): FactorizedExperiment[] =>
  experiments.map((experiment) => {
    const overrideForExperiment = overrides[experiment.experimentId] ?? {};
    const factors = experiment.factors.map((factor) => {
      const override = overrideForExperiment[factor.name];
      if (!override) {
        return factor;
      }
      return {
        ...factor,
        value: override.value
      };
    });
    return { ...experiment, factors };
  });

const createGroupingFromFactors = ({
  experiments,
  factorsUsed,
  recipeId,
  description,
  temperatureBinning
}: {
  experiments: FactorizedExperiment[];
  factorsUsed: string[];
  recipeId: string;
  description: string;
  temperatureBinning?: number;
}): GroupingOption => {
  const groupsMap = new Map<string, GroupDefinition>();

  experiments.forEach((experiment) => {
    const signatureEntries = factorsUsed.reduce<Record<string, string | number | null>>(
      (acc, factorName) => {
        const factorValue = experiment.factors.find((factor) => factor.name === factorName);
        if (temperatureBinning && factorName === "temperature") {
          const numericValue =
            typeof factorValue?.value === "number"
              ? factorValue.value
              : Number.parseFloat(String(factorValue?.value ?? ""));
          if (Number.isFinite(numericValue)) {
            const lower = Math.floor(numericValue / temperatureBinning) * temperatureBinning;
            const upper = lower + temperatureBinning;
            acc[factorName] = `${lower}-${upper}°C`;
          } else {
            acc[factorName] = normalizeValue(factorValue?.value ?? null);
          }
          return acc;
        }
        acc[factorName] = normalizeValue(factorValue?.value ?? null);
        return acc;
      },
      {}
    );

    const signatureKey = factorsUsed
      .map((key) => `${key}:${signatureEntries[key] ?? "n/a"}`)
      .join("|");
    const existing = groupsMap.get(signatureKey);
    if (existing) {
      existing.experimentIds.push(experiment.experimentId);
    } else {
      groupsMap.set(signatureKey, {
        groupId: createGroupId(recipeId, groupsMap.size),
        name: factorsUsed.length > 0 ? factorsUsed.join(" + ") : "Ungrouped",
        experimentIds: [experiment.experimentId],
        signature: signatureEntries,
        createdFromRecipe: recipeId
      });
    }
  });

  return {
    recipeId,
    description,
    groups: Array.from(groupsMap.values()),
    factorsUsed
  };
};

export const buildGroupingOptions = ({
  experiments,
  overrides,
  availableFactors
}: {
  experiments: FactorizedExperiment[];
  overrides: FactorOverrideMap;
  availableFactors: string[];
}): GroupingOption[] => {
  const factorized = applyOverrides(experiments, overrides);
  const options: GroupingOption[] = [];
  const has = (factorName: string) =>
    availableFactors.includes(factorName) &&
    factorized.some((experiment) =>
      experiment.factors.some(
        (factor) => factor.name === factorName && normalizeValue(factor.value) !== null
      )
    );

  if (has("catalyst")) {
    options.push(
      createGroupingFromFactors({
        experiments: factorized,
        factorsUsed: ["catalyst"],
        recipeId: "by-catalyst",
        description: "Group by catalyst only"
      })
    );
  }

  if (has("catalyst") && has("additive")) {
    options.push(
      createGroupingFromFactors({
        experiments: factorized,
        factorsUsed: ["catalyst", "additive"],
        recipeId: "by-catalyst-additive",
        description: "Group by catalyst + additive"
      })
    );
  }

  if (has("substrate") && has("catalyst")) {
    options.push(
      createGroupingFromFactors({
        experiments: factorized,
        factorsUsed: ["substrate", "catalyst"],
        recipeId: "by-substrate-catalyst",
        description: "Group by substrate + catalyst"
      })
    );
  }

  if (has("temperature")) {
    options.push(
      createGroupingFromFactors({
        experiments: factorized,
        factorsUsed: ["temperature"],
        recipeId: "by-temperature",
        description: "Group by temperature",
        temperatureBinning: 10
      })
    );
  }

  if (factorized.length > 0) {
    options.push({
      recipeId: "all-in-one",
      description: "Single group with all experiments",
      groups: [
        {
          groupId: createGroupId("all-in-one", 0),
          name: "All experiments",
          experimentIds: factorized.map((item) => item.experimentId),
          signature: {},
          createdFromRecipe: "all-in-one"
        }
      ],
      factorsUsed: []
    });

    options.push({
      recipeId: "one-per-experiment",
      description: "One group per experiment",
      groups: factorized.map((item, index) => ({
        groupId: createGroupId("one-per-experiment", index),
        name: `Group for ${item.experimentId}`,
        experimentIds: [item.experimentId],
        signature: {},
        createdFromRecipe: "one-per-experiment"
      })),
      factorsUsed: []
    });
  }

  const seen = new Set<string>();
  return options.filter((option) => {
    const key = `${option.recipeId}:${option.groups.length}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
};
