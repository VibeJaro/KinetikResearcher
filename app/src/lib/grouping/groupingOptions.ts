import type { GroupingOption, ManualGroup } from "./types";

const createGroupId = (parts: string[]): string =>
  `group-${parts
    .map((part) => part || "any")
    .join("-")
    .replace(/\s+/g, "-")
    .toLowerCase()}`;

const normalizeValue = (value: string | number | null | undefined): string | number | null => {
  if (value === undefined) {
    return null;
  }
  if (value === null) {
    return null;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length === 0 ? null : trimmed;
  }
  return value;
};

const buildGroupsForRecipe = (
  factorsUsed: string[],
  factorTable: Record<string, { [factor: string]: string | number | null }>
) => {
  const signatureToExperiments = new Map<string, { signature: Record<string, string | number | null>; experimentIds: string[] }>();

  Object.entries(factorTable).forEach(([experimentId, factors]) => {
    const signature: Record<string, string | number | null> = {};
    factorsUsed.forEach((factorName) => {
      signature[factorName] = normalizeValue(factors[factorName]);
    });
    const key = factorsUsed.map((name) => `${name}:${signature[name] ?? ""}`).join("|");
    const existing = signatureToExperiments.get(key);
    if (existing) {
      existing.experimentIds.push(experimentId);
    } else {
      signatureToExperiments.set(key, { signature, experimentIds: [experimentId] });
    }
  });

  return Array.from(signatureToExperiments.values()).map((entry) => ({
    groupId: createGroupId(factorsUsed.map((factor) => `${factor}-${entry.signature[factor] ?? "any"}`)),
    signature: entry.signature,
    experimentIds: entry.experimentIds
  }));
};

export const generateGroupingOptions = ({
  factorTable,
  availableFactors
}: {
  factorTable: Record<string, { [factor: string]: string | number | null }>;
  availableFactors: string[];
}): GroupingOption[] => {
  const options: GroupingOption[] = [];
  const recipes: Array<{ id: string; factors: string[]; description: string }> = [
    { id: "by-catalyst", factors: ["catalyst"], description: "Group by catalyst" },
    {
      id: "by-catalyst-additive",
      factors: ["catalyst", "additive"],
      description: "Group by catalyst + additive"
    },
    {
      id: "by-substrate-catalyst",
      factors: ["substrate", "catalyst"],
      description: "Group by substrate + catalyst"
    }
  ];

  const availableSet = new Set(availableFactors);

  recipes.forEach((recipe) => {
    if (!recipe.factors.some((factor) => availableSet.has(factor))) {
      return;
    }
    const used = recipe.factors.filter((factor) => availableSet.has(factor));
    const groups = buildGroupsForRecipe(used, factorTable);
    options.push({
      recipeId: recipe.id,
      description: recipe.description,
      factorsUsed: used,
      groups
    });
  });

  return options;
};

export const initializeManualGroups = (
  option: GroupingOption,
  experimentNames: Record<string, string>
): ManualGroup[] =>
  option.groups.map((group, index) => ({
    groupId: group.groupId,
    name: `Group ${index + 1}`,
    experimentIds: group.experimentIds,
    signature: group.signature,
    createdFromRecipe: option.recipeId,
    warningFactors: group.warningFactors
  }));
