import { describe, expect, it } from "vitest";
import { buildGroupingOptions } from "../lib/grouping/groupingOptions";
import type { FactorizedExperiment, FactorOverrideMap } from "../lib/grouping/types";

const makeExperiment = (id: string, catalyst: string, additive: string): FactorizedExperiment => ({
  experimentId: id,
  factors: [
    { name: "catalyst", value: catalyst, confidence: "high", provenance: [] },
    { name: "additive", value: additive, confidence: "medium", provenance: [] }
  ]
});

describe("grouping options", () => {
  it("creates grouping recipes with overrides applied", () => {
    const experiments: FactorizedExperiment[] = [
      makeExperiment("exp-1", "Pd/C", "TEA"),
      makeExperiment("exp-2", "Pd/C", "TEA"),
      makeExperiment("exp-3", "Pd/C", "Water")
    ];

    const overrides: FactorOverrideMap = {
      "exp-3": {
        additive: {
          value: "TEA",
          updatedAt: new Date().toISOString()
        }
      }
    };

    const options = buildGroupingOptions({
      experiments,
      overrides,
      availableFactors: ["catalyst", "additive"]
    });

    const catalystOnly = options.find((option) => option.recipeId === "by-catalyst");
    expect(catalystOnly?.groups[0]?.experimentIds).toHaveLength(3);

    const catalystAdditive = options.find((option) => option.recipeId === "by-catalyst-additive");
    expect(catalystAdditive?.groups).toHaveLength(1);
    expect(catalystAdditive?.groups[0]?.experimentIds.sort()).toEqual([
      "exp-1",
      "exp-2",
      "exp-3"
    ]);
  });
});
