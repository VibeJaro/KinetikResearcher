export type CanonicalizationResult = {
  canonicalToAliases: Record<string, string[]>;
  notes: string;
  uncertainties: string[];
};

export type CanonicalizationSuccessResponse = {
  ok: true;
  requestId: string;
  result: CanonicalizationResult;
};

export type CanonicalizationErrorResponse = {
  ok: false;
  error: string;
  details?: string;
  requestId?: string;
};

export type CanonicalGroupInput = {
  canonical: string;
  aliases: string[];
};

export type CanonicalValidationOk = {
  ok: true;
  canonicalToAliases: Record<string, string[]>;
  rawToCanonical: Record<string, string>;
};

export type CanonicalValidationError = {
  ok: false;
  errors: string[];
  missing: string[];
  duplicates: string[];
  extraneous: string[];
};

export type CanonicalValidationResult = CanonicalValidationOk | CanonicalValidationError;

export type CanonicalMapState = {
  columnName: string;
  canonicalToAliases: Record<string, string[]>;
  rawToCanonical: Record<string, string>;
  notes: string;
  uncertainties: string[];
  requestId: string | null;
  values: string[];
};
