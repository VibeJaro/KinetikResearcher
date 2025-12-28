import { describe, expect, it } from "vitest";
import { collectUniqueValues, validateCanonicalAssignments } from "../lib/canonicalization";
import type { Experiment } from "../types/experiment";

const buildExperiment = (metaRaw: Record<string, string | number | null>): Experiment => ({
  experimentId: "exp",
  series: [],
  metaRaw
});

describe("collectUniqueValues", () => {
  it("trims strings, converts numbers, and ignores empty entries", () => {
    const experiments: Experiment[] = [
      buildExperiment({ Catalyst_used: " Pd/C ", Solvent: null }),
      buildExperiment({ Catalyst_used: "Pd/C", Solvent: undefined }),
      buildExperiment({ Catalyst_used: "Pd-C" }),
      buildExperiment({ Catalyst_used: 5 }),
      buildExperiment({ Catalyst_used: "" })
    ];

    const values = collectUniqueValues(experiments, "Catalyst_used");
    expect(values).toEqual(["Pd/C", "Pd-C", "5"]);
  });

  it("returns the most frequent values first and caps at 300 entries", () => {
    const experiments: Experiment[] = [];
    for (let index = 0; index < 305; index += 1) {
      experiments.push(buildExperiment({ Catalyst_used: `Val-${index % 3}` }));
    }

    const values = collectUniqueValues(experiments, "Catalyst_used");
    expect(values.slice(0, 3)).toEqual(["Val-0", "Val-1", "Val-2"]);
    expect(values.length).toBe(3);
  });
});

describe("validateCanonicalAssignments", () => {
  const uniqueValues = ["Pd/C", "Pd-C", "Pd on C", "Pd/C reused"];

  it("accepts full coverage without duplicates", () => {
    const result = validateCanonicalAssignments(uniqueValues, [
      { canonical: "Pd/C", aliases: ["Pd/C", "Pd-C"] },
      { canonical: "Pd/C reused", aliases: ["Pd/C reused"] },
      { canonical: "Pd on C", aliases: ["Pd on C"] }
    ]);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.rawToCanonical).toHaveProperty("Pd-C", "Pd/C");
    }
  });

  it("detects missing and duplicate alias assignments", () => {
    const result = validateCanonicalAssignments(uniqueValues, [
      { canonical: "Pd/C", aliases: ["Pd/C", "Pd-C"] },
      { canonical: "Pd/C reused", aliases: ["Pd/C reused"] },
      { canonical: "Pd reuse", aliases: ["Pd/C reused"] }
    ]);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.missing).toContain("Pd on C");
      expect(result.duplicates).toContain("Pd/C reused");
    }
  });

  it("flags aliases that are not part of the unique raw values", () => {
    const result = validateCanonicalAssignments(uniqueValues, [
      { canonical: "Pd/C", aliases: ["Pd/C", "Pd on C"] },
      { canonical: "Pd-C", aliases: ["Unknown catalyst"] }
    ]);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.extraneous).toContain("Unknown catalyst");
    }
  });
});
