import { describe, expect, it } from "vitest";
import { collectUniqueValues } from "../lib/canonicalization/collectUniqueValues";
import type { Experiment } from "../types/experiment";

const buildExperiment = (overrides: Partial<Experiment> = {}): Experiment => ({
  experimentId: overrides.experimentId ?? "exp-1",
  name: overrides.name,
  series: overrides.series ?? [],
  metaRaw: overrides.metaRaw ?? {}
});

describe("collectUniqueValues", () => {
  it("normalizes strings and numbers while ignoring null or empty entries", () => {
    const experiments: Experiment[] = [
      buildExperiment({ experimentId: "exp-a", metaRaw: { Catalyst_used: " Pd/C " } }),
      buildExperiment({ experimentId: "exp-b", metaRaw: { Catalyst_used: "Pd/C" } }),
      buildExperiment({ experimentId: "exp-c", metaRaw: { Catalyst_used: "Pd-C" } }),
      buildExperiment({ experimentId: "exp-d", metaRaw: { Catalyst_used: null } }),
      buildExperiment({ experimentId: "exp-e", metaRaw: { Catalyst_used: "" } }),
      buildExperiment({ experimentId: "exp-f", metaRaw: { Catalyst_used: 42 } })
    ];

    const result = collectUniqueValues(experiments, "Catalyst_used");
    expect(result.values).toEqual(["Pd/C", "42", "Pd-C"]);
    expect(result.counts).toEqual({
      "42": 1,
      "Pd-C": 1,
      "Pd/C": 2
    });
  });

  it("caps the returned list at 300 most frequent values", () => {
    const experiments: Experiment[] = Array.from({ length: 350 }, (_, index) =>
      buildExperiment({
        experimentId: `exp-${index}`,
        metaRaw: { Catalyst_used: `Cat-${index}` }
      })
    );

    const result = collectUniqueValues(experiments, "Catalyst_used");
    expect(result.values).toHaveLength(300);
    expect(result.values[0]).toBe("Cat-0");
    expect(new Set(result.values).size).toBe(300);
    const sorted = [...result.values].sort((a, b) => a.localeCompare(b));
    expect(result.values).toEqual(sorted);
  });
});
