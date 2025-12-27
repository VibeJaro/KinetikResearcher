import { describe, expect, it } from "vitest";
import { generateGroupingRecipes } from "../lib/grouping/groupingRecipes";
import type { Experiment } from "../lib/import/types";
import type { ExtractedFactor } from "../lib/grouping/types";

const experiments: Experiment[] = [
  {
    id: "exp-1",
    name: "Experiment 1",
    series: [],
    metaRaw: {},
    metaConsistency: {}
  },
  {
    id: "exp-2",
    name: "Experiment 2",
    series: [],
    metaRaw: {},
    metaConsistency: {}
  }
];

const extracted: Record<string, ExtractedFactor[]> = {
  "exp-1": [
    { name: "catalyst", value: "Pd/C", confidence: "high", provenance: [] },
    { name: "additive", value: "TEA", confidence: "medium", provenance: [] }
  ],
  "exp-2": [
    { name: "catalyst", value: "Pt/Al2O3", confidence: "high", provenance: [] },
    { name: "additive", value: "TEA", confidence: "medium", provenance: [] }
  ]
};

describe("grouping recipes", () => {
  it("creates deterministic grouping options from factor maps", () => {
    const recipes = generateGroupingRecipes({
      experiments,
      extracted,
      overrides: {}
    });

    const catalystRecipe = recipes.find((recipe) => recipe.recipeId === "by-catalyst");
    expect(catalystRecipe).toBeDefined();
    expect(catalystRecipe?.groups).toHaveLength(2);

    const catalystAdditive = recipes.find(
      (recipe) => recipe.recipeId === "by-catalyst-additive"
    );
    expect(catalystAdditive).toBeDefined();
    expect(catalystAdditive?.groups[0].signature.additive).toBe("TEA");
  });
});
