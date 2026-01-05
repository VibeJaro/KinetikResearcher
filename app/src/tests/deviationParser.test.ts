import { describe, expect, it } from "vitest";
import { parseDeviationResponse } from "../lib/deviations/parser";
import { ONTOLOGY_CATEGORIES } from "../lib/deviations/categories";

const buildPayload = (category: string) => ({
  experimentId: "exp-1",
  summary: "Test summary",
  categories: [
    {
      category,
      severity: "low",
      rationale: "Test rationale",
      sourceColumns: ["comment"]
    }
  ]
});

describe("parseDeviationResponse", () => {
  it("accepts only the known ontology categories", () => {
    const payload = buildPayload(ONTOLOGY_CATEGORIES[0]);
    const result = parseDeviationResponse(payload);
    expect(result.categories[0].category).toBe(ONTOLOGY_CATEGORIES[0]);
  });

  it("rejects unknown categories", () => {
    const payload = buildPayload("custom_category");
    expect(() => parseDeviationResponse(payload)).toThrow(/Unknown category/i);
  });
});
