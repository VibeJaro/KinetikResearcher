import type { Experiment } from "../import/types";
import type {
  ExtractedFactor,
  FactorOverride,
  FactorValue,
  FinalGroup,
  GroupingGroup,
  GroupingRecipe
} from "./types";

const createId = (prefix: string): string => `${prefix}-${Math.random().toString(36).slice(2, 10)}`;

const getEffectiveFactorMap = (
  experimentId: string,
  factors: ExtractedFactor[],
  overrides: Record<string, Record<string, FactorOverride | undefined>>
): Record<string, FactorValue> => {
  const overrideMap = overrides[experimentId] ?? {};
  return factors.reduce<Record<string, FactorValue>>((acc, factor) => {
    const override = overrideMap[factor.name];
    acc[factor.name] = override ? override.value : factor.value;
    return acc;
  }, {});
};

const temperatureBin = (value: FactorValue): string => {
  if (typeof value !== "number") {
    return "unspecified";
  }
  if (value <= 25) {
    return "<=25°C";
  }
  if (value <= 60) {
    return "26–60°C";
  }
  return ">60°C";
};

const buildGroupsForFactors = ({
  experiments,
  factorNames,
  extracted,
  overrides,
  recipeId,
  recipeLabel,
  useTemperatureBins
}: {
  experiments: Experiment[];
  factorNames: string[];
  extracted: Record<string, ExtractedFactor[]>;
  overrides: Record<string, Record<string, FactorOverride | undefined>>;
  recipeId: string;
  recipeLabel: string;
  useTemperatureBins?: boolean;
}): GroupingRecipe | null => {
  const groups = new Map<string, GroupingGroup>();

  experiments.forEach((experiment) => {
    const factors = extracted[experiment.id] ?? [];
    const factorMap = getEffectiveFactorMap(experiment.id, factors, overrides);

    const signatureEntries = factorNames.map((factorName) => {
      const value = factorMap[factorName];
      if (useTemperatureBins && factorName === "temperature") {
        return [factorName, temperatureBin(value)] as const;
      }
      return [factorName, value ?? "unspecified"] as const;
    });
    const signature = Object.fromEntries(signatureEntries);
    const key = factorNames.map((name) => signature[name]).join("|");

    const existing = groups.get(key);
    if (existing) {
      existing.experimentIds.push(experiment.id);
    } else {
      groups.set(key, {
        groupId: createId("group"),
        name: `${recipeLabel}: ${key || "unspecified"}`,
        signature,
        experimentIds: [experiment.id],
        warnings: undefined
      });
    }
  });

  if (groups.size === 0) {
    return null;
  }

  return {
    recipeId,
    description: recipeLabel,
    factors: factorNames,
    groups: Array.from(groups.values())
  };
};

export const generateGroupingRecipes = ({
  experiments,
  extracted,
  overrides
}: {
  experiments: Experiment[];
  extracted: Record<string, ExtractedFactor[]>;
  overrides: Record<string, Record<string, FactorOverride | undefined>>;
}): GroupingRecipe[] => {
  const availableFactors = Array.from(
    new Set(
      Object.values(extracted)
        .flat()
        .map((item) => item.name)
    )
  );

  const recipes: GroupingRecipe[] = [];

  const addRecipe = (
    recipeId: string,
    label: string,
    factorNames: string[],
    useTemperatureBins?: boolean
  ) => {
    const recipe = buildGroupsForFactors({
      experiments,
      factorNames,
      extracted,
      overrides,
      recipeId,
      recipeLabel: label,
      useTemperatureBins
    });
    if (recipe) {
      recipes.push(recipe);
    }
  };

  if (availableFactors.includes("catalyst")) {
    addRecipe("by-catalyst", "By catalyst", ["catalyst"]);
  }

  if (availableFactors.includes("catalyst") && availableFactors.includes("additive")) {
    addRecipe("by-catalyst-additive", "By catalyst + additive", ["catalyst", "additive"]);
  }

  if (availableFactors.includes("substrate")) {
    addRecipe("by-substrate-catalyst", "By substrate + catalyst", ["substrate", "catalyst"]);
  }

  if (availableFactors.includes("temperature")) {
    addRecipe("by-temperature-bin", "By temperature bins", ["temperature"], true);
  }

  if (recipes.length === 0 && availableFactors.length > 0) {
    addRecipe("by-first-factor", `By ${availableFactors[0]}`, [availableFactors[0]]);
  }

  return recipes;
};

export const toFinalGroups = (
  recipe: GroupingRecipe | null,
  overrides: Record<string, Record<string, FactorOverride | undefined>>
): FinalGroup[] => {
  if (!recipe) {
    return [];
  }
  return recipe.groups.map((group) => ({
    groupId: group.groupId,
    name: group.name,
    experimentIds: group.experimentIds,
    signature: group.signature,
    createdFromRecipe: recipe.recipeId
  }));
};

export const applyGroupWarningFlags = (
  group: GroupingGroup,
  factorValues: Record<string, Record<string, FactorValue>>
): GroupingGroup => {
  const focusFactors = ["catalyst", "additive"];
  const warnings: string[] = [];
  focusFactors.forEach((factorName) => {
    const values = group.experimentIds
      .map((id) => factorValues[id]?.[factorName])
      .filter((value) => value !== undefined && value !== null);
    const distinct = Array.from(new Set(values));
    if (distinct.length > 1) {
      warnings.push(`${factorName} differs across experiments`);
    }
  });

  return warnings.length > 0 ? { ...group, warnings } : group;
};
