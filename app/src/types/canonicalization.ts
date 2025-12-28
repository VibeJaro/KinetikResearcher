export type CanonicalizationSuccessResponse = {
  ok: true;
  requestId: string;
  result: {
    canonicalToAliases: Record<string, string[]>;
    notes?: string;
    uncertainties?: string[];
  };
};

export type CanonicalizationErrorResponse = {
  ok: false;
  requestId: string;
  error: string;
  details?: string;
};

export type CanonicalizationResponse =
  | CanonicalizationSuccessResponse
  | CanonicalizationErrorResponse;
