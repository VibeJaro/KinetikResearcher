import { ONTOLOGY_CATEGORIES, isDeviationCategory } from "./categories";
import type { DeviationAnalysis, DeviationCategoryFinding } from "./types";

type ValidationResult<T> = { ok: true; value: T } | { ok: false; message: string };

const asString = (value: unknown): string | null =>
  typeof value === "string" && value.trim().length > 0 ? value.trim() : null;

const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

const sanitizeSourceColumns = (value: unknown): string[] => {
  const raw = asArray(value);
  const trimmed = raw
    .map((entry) => asString(entry))
    .filter((entry): entry is string => Boolean(entry));
  return Array.from(new Set(trimmed)).slice(0, 6);
};

const validateCategoryFinding = (
  value: unknown,
  allowedCategories: readonly string[]
): ValidationResult<DeviationCategoryFinding> => {
  if (typeof value !== "object" || value === null) {
    return { ok: false, message: "Invalid category item" };
  }
  const category = asString((value as any).category);
  const severity = asString((value as any).severity);
  const rationale = asString((value as any).rationale) ?? "Keine Begründung geliefert";
  const sourceColumns = sanitizeSourceColumns((value as any).sourceColumns);

  if (!category || !allowedCategories.includes(category)) {
    return { ok: false, message: "Unknown category" };
  }
  if (!["low", "medium", "high"].includes(severity ?? "")) {
    return { ok: false, message: "Invalid severity" };
  }

  return {
    ok: true,
    value: {
      category: category as any,
      severity: severity as "low" | "medium" | "high",
      rationale,
      sourceColumns
    }
  };
};

export const parseDeviationResponse = (
  payload: unknown,
  allowedCategories: readonly string[] = ONTOLOGY_CATEGORIES
): DeviationAnalysis => {
  if (typeof payload !== "object" || payload === null) {
    throw new Error("Model output must be an object");
  }
  const experimentId = asString((payload as any).experimentId);
  const summary = asString((payload as any).summary) ?? "Keine Zusammenfassung geliefert";
  const categoriesRaw = asArray((payload as any).categories);

  if (!experimentId) {
    throw new Error("Missing experimentId");
  }

  const findings: DeviationCategoryFinding[] = [];
  for (const entry of categoriesRaw.slice(0, 3)) {
    const validated = validateCategoryFinding(entry, allowedCategories);
    if (!validated.ok) {
      throw new Error(validated.message);
    }
    findings.push(validated.value);
  }

  const unknownCategories = categoriesRaw
    .map((item) => (item as any)?.category)
    .filter((category) => category && !isDeviationCategory(category));

  if (unknownCategories.length > 0) {
    throw new Error("Unknown categories present");
  }

  return {
    experimentId,
    summary,
    categories: findings,
    model: "unknown",
    usedFallback: false
  };
};
