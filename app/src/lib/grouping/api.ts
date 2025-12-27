import type {
  ColumnScanRequest,
  ColumnScanResponse,
  FactorExtractionRequest,
  FactorExtractionResponse
} from "./types";

const handleResponse = async (response: Response) => {
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || "Request failed");
  }
  return response.json();
};

export const requestColumnScan = async (
  payload: ColumnScanRequest
): Promise<ColumnScanResponse> => {
  const response = await fetch("/api/column-scan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  return handleResponse(response);
};

export const requestFactorExtraction = async (
  payload: FactorExtractionRequest
): Promise<FactorExtractionResponse> => {
  const response = await fetch("/api/factor-extraction", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  return handleResponse(response);
};
