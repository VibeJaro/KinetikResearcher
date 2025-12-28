import { randomUUID } from "crypto";
import { describe, expect, it } from "vitest";
import type { Experiment } from "../types/experiment";
import { collectUniqueValues } from "../lib/canonicalization/collectUniqueValues";

const buildExperiment = (metaRaw: Record<string, string | number | null>): Experiment => ({
  experimentId: randomUUID(),
  name: "exp",
  series: [],
  metaRaw
});

describe("collectUniqueValues", () => {
  it("returns unique trimmed string values", () => {
    const experiments = [
      buildExperiment({ Catalyst: "Pd/C " }),
      buildExperiment({ Catalyst: " Pd/C" }),
      buildExperiment({ Catalyst: " Pd/C  " })
    ];

    const result = collectUniqueValues(experiments, "Catalyst");
    expect(result).toEqual(["Pd/C"]);
  });

  it("converts numbers to strings and ignores nullish", () => {
    const experiments = [
      buildExperiment({ Temperature: 50 }),
      buildExperiment({ Temperature: null }),
      buildExperiment({ Temperature: 50 }),
      buildExperiment({ Temperature: undefined as unknown as string })
    ];

    const result = collectUniqueValues(experiments, "Temperature");
    expect(result).toEqual(["50"]);
  });

  it("limits to 300 most frequent values", () => {
    const experiments: Experiment[] = [];
    for (let i = 0; i < 310; i += 1) {
      const value = i < 5 ? "common" : `value-${i}`;
      experiments.push(buildExperiment({ ColumnA: value }));
    }

    const result = collectUniqueValues(experiments, "ColumnA");
    expect(result).toHaveLength(300);
    expect(result[0]).toBe("common");
  });

  it("returns empty array for missing data", () => {
    const experiments = [buildExperiment({}), buildExperiment({ ColumnA: "" })];
    expect(collectUniqueValues(experiments, "ColumnA")).toEqual([]);
  });
});
