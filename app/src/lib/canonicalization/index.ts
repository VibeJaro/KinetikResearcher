import type {
  CanonicalGroupInput,
  CanonicalValidationError,
  CanonicalValidationResult
} from "../../types/canonicalization";
import type { Experiment } from "../../types/experiment";

const MAX_UNIQUE_VALUES = 300;

export function collectUniqueValues(
  experiments: Experiment[],
  columnName: string
): string[] {
  const trimmedColumn = columnName.trim();
  if (!trimmedColumn) {
    return [];
  }

  const counts = new Map<string, number>();
  const firstSeen = new Map<string, number>();

  experiments.forEach((experiment, experimentIndex) => {
    const value = experiment.metaRaw?.[trimmedColumn];
    if (value === null || value === undefined) {
      return;
    }

    if (typeof value === "string") {
      const normalized = value.trim();
      if (normalized) {
        counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
        if (!firstSeen.has(normalized)) {
          firstSeen.set(normalized, experimentIndex);
        }
      }
      return;
    }

    if (typeof value === "number") {
      const normalized = value.toString();
      counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
      if (!firstSeen.has(normalized)) {
        firstSeen.set(normalized, experimentIndex);
      }
    }
  });

  const sorted = Array.from(counts.entries()).sort((a, b) => {
    if (b[1] === a[1]) {
      const firstA = firstSeen.get(a[0]) ?? 0;
      const firstB = firstSeen.get(b[0]) ?? 0;
      return firstA - firstB;
    }
    return b[1] - a[1];
  });

  return sorted.slice(0, MAX_UNIQUE_VALUES).map(([value]) => value);
}

const uniqueStrings = (values: string[]): string[] => {
  const seen = new Set<string>();
  const result: string[] = [];
  values.forEach((value) => {
    if (!seen.has(value)) {
      seen.add(value);
      result.push(value);
    }
  });
  return result;
};

export function validateCanonicalAssignments(
  uniqueValues: string[],
  groups: CanonicalGroupInput[]
): CanonicalValidationResult {
  const valueSet = new Set(uniqueValues);
  const coverage = new Map<string, string>();
  const canonicalToAliases: Record<string, string[]> = {};

  const errors: string[] = [];
  const duplicates: string[] = [];
  const extraneous: string[] = [];

  const normalizedGroups = groups
    .map((group) => ({
      canonical: group.canonical.trim(),
      aliases: group.aliases.map((alias) => alias.trim()).filter(Boolean)
    }))
    .filter((group) => group.canonical.length > 0);

  const canonicalNames = normalizedGroups.map((group) => group.canonical);
  const canonicalDuplicate = canonicalNames.find(
    (name, index) => canonicalNames.indexOf(name) !== index
  );
  if (canonicalDuplicate) {
    errors.push(`Canonical label duplicated: ${canonicalDuplicate}`);
  }

  normalizedGroups.forEach((group) => {
    const dedupedAliases = uniqueStrings(group.aliases);
    canonicalToAliases[group.canonical] = dedupedAliases;

    dedupedAliases.forEach((alias) => {
      if (!valueSet.has(alias)) {
        extraneous.push(alias);
        return;
      }
      if (coverage.has(alias)) {
        duplicates.push(alias);
        return;
      }
      coverage.set(alias, group.canonical);
    });
  });

  const missing = uniqueValues.filter((value) => !coverage.has(value));

  if (normalizedGroups.length === 0) {
    errors.push("At least one canonical group is required");
  }

  if (errors.length > 0 || missing.length > 0 || duplicates.length > 0 || extraneous.length > 0) {
    return {
      ok: false,
      errors,
      missing: uniqueStrings(missing),
      duplicates: uniqueStrings(duplicates),
      extraneous: uniqueStrings(extraneous)
    } as CanonicalValidationError;
  }

  const rawToCanonical: Record<string, string> = {};
  coverage.forEach((canonical, raw) => {
    rawToCanonical[raw] = canonical;
  });

  return { ok: true, canonicalToAliases, rawToCanonical };
}
