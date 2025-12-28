import { describe, expect, it } from "vitest";
import { collectUniqueValues } from "../lib/canonicalization/collectUniqueValues";

describe("collectUniqueValues", () => {
  it("trims, stringifies, deduplicates and counts values", () => {
    const experiments: Array<{ metaRaw: Record<string, string | number | null> }> = [
      { metaRaw: { Catalyst_used: " Pd-C " } },
      { metaRaw: { Catalyst_used: "Pd/C" } },
      { metaRaw: { Catalyst_used: "Pd/C" } },
      { metaRaw: { Catalyst_used: 5 } },
      { metaRaw: { Catalyst_used: "" } },
      { metaRaw: { Catalyst_used: null } },
      { metaRaw: {} }
    ];

    const result = collectUniqueValues(experiments, "Catalyst_used");

    expect(result.values).toEqual(["Pd/C", "5", "Pd-C"]);
    expect(result.counts).toEqual({ "5": 1, "Pd-C": 1, "Pd/C": 2 });
  });

  it("caps the returned values at 300 entries", () => {
    const experiments: Array<{ metaRaw: Record<string, string | number | null> }> = Array.from(
      { length: 320 },
      (_, index) => ({
        metaRaw: { Catalyst_used: `Value-${index}` }
      })
    );

    const result = collectUniqueValues(experiments, "Catalyst_used");

    expect(result.values.length).toBe(300);
    expect(Object.keys(result.counts)).toHaveLength(300);
  });
});
