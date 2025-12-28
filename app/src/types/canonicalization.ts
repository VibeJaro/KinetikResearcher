export type CanonicalizationResult = {
  canonicalToAliases: Record<string, string[]>;
  notes: string;
  uncertainties: string[];
};

export type CanonicalGroupDraft = {
  canonical: string;
  aliases: string[];
};

export type CanonicalMapState = {
  columnName: string;
  canonicalToAliases: Record<string, string[]>;
  rawToCanonical: Record<string, string>;
  notes: string;
  uncertainties: string[];
  requestId: string | null;
  sourceValues: string[];
};

export type CanonicalizationSummary = {
  columnName: string;
  canonicalGroupCount: number;
  rawValueCount: number;
  unmapped: number;
};
