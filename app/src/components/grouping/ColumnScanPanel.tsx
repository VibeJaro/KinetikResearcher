import { useEffect, useMemo, useState } from "react";
import type { ColumnScanPayload, ColumnScanResult } from "../../types/columnScan";

type ColumnScanPanelProps = {
  payload: ColumnScanPayload | null;
};

const roleLabels: Record<ColumnScanResult["columnRoles"][string], string> = {
  condition: "Condition",
  comment: "Comment",
  noise: "Noise"
};

const formatRatio = (ratio: number): string =>
  Number.isFinite(ratio) ? `${(ratio * 100).toFixed(1)}% non-null` : "n/a";

export const ColumnScanPanel = ({ payload }: ColumnScanPanelProps) => {
  const [includeComments, setIncludeComments] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorDetails, setErrorDetails] = useState<string | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [result, setResult] = useState<ColumnScanResult | null>(null);
  const [selectedColumnsFinal, setSelectedColumnsFinal] = useState<string[]>([]);
  const [lastPayload, setLastPayload] = useState<Record<string, unknown> | null>(null);
  const [lastModelOutput, setLastModelOutput] = useState<string | null>(null);
  const [lastPrompt, setLastPrompt] = useState<{ system?: string; user?: string } | null>(null);

  useEffect(() => {
    setResult(null);
    setSelectedColumnsFinal([]);
    setError(null);
    setErrorDetails(null);
    setRequestId(null);
    setLastPayload(null);
    setLastModelOutput(null);
    setLastPrompt(null);
  }, [payload]);

  useEffect(() => {
    if (result) {
      setSelectedColumnsFinal(result.selectedColumns);
    }
  }, [result]);

  const knownStructuralSummary = useMemo(() => {
    if (!payload) {
      return [];
    }
    const { structuralSummary } = payload;
    const chips: string[] = [];
    if (structuralSummary.time) chips.push(`Time: ${structuralSummary.time}`);
    if (structuralSummary.experiment) chips.push(`Experiment: ${structuralSummary.experiment}`);
    if (structuralSummary.values.length > 0) {
      chips.push(`Values: ${structuralSummary.values.join(", ")}`);
    }
    return chips;
  }, [payload]);

  const handleRunScan = async () => {
    if (!payload || payload.columns.length === 0) {
      return;
    }
    setLoading(true);
    setError(null);
    setErrorDetails(null);
    setResult(null);
    setRequestId(null);
    setLastModelOutput(null);
    setLastPrompt(null);
    try {
      const requestPayload = {
        columns: payload.columns,
        experimentCount: payload.experimentCount ?? undefined,
        knownStructuralColumns: payload.knownStructuralColumns,
        includeComments
      };
      setLastPayload(requestPayload);

      const response = await fetch("/api/column-scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestPayload)
      });

      const contentType = response.headers.get("content-type");
      let data: any = null;
      let rawText: string | null = null;
      if (contentType && contentType.includes("application/json")) {
        data = await response.json();
      } else {
        rawText = await response.text();
      }

      const responseRequestId = data?.requestId ?? null;
      setRequestId(responseRequestId);
      const modelOutput = data?.debug?.modelOutput ?? data?.modelOutputPreview ?? null;
      setLastModelOutput(typeof modelOutput === "string" ? modelOutput : rawText);
      if (data?.debug?.modelInput) {
        setLastPrompt({
          system: data.debug.modelInput.system,
          user: data.debug.modelInput.user
        });
      }

      if (!response.ok || !data?.ok) {
        setError(data?.error ?? "Column scan failed");
        const details = data?.details ?? rawText ?? response.statusText;
        setErrorDetails(typeof details === "string" && details.length > 0 ? details : null);
        return;
      }

      if (!data.result) {
        setError("Column scan failed");
        setErrorDetails("Missing result payload");
        return;
      }

      setResult(data.result as ColumnScanResult);
      if (typeof data.debug?.modelOutput === "string") {
        setLastModelOutput(data.debug.modelOutput);
      }
      if (data?.debug?.modelInput) {
        setLastPrompt({
          system: data.debug.modelInput.system,
          user: data.debug.modelInput.user
        });
      }
    } catch (err) {
      setError("Column scan failed");
      setErrorDetails(err instanceof Error ? err.message : "Unexpected error");
    } finally {
      setLoading(false);
    }
  };

  const toggleColumn = (name: string) => {
    setSelectedColumnsFinal((prev) =>
      prev.includes(name) ? prev.filter((value) => value !== name) : [...prev, name]
    );
  };

  return (
    <div className="column-scan-card">
      <div className="column-scan-header">
        <div>
          <h4>Column scan</h4>
          <p className="meta">
            Send the current column summary to /api/column-scan, get suggested roles, and refine the
            kept columns.
          </p>
        </div>
        <div className="column-scan-actions">
          <label className="toggle">
            <input
              type="checkbox"
              checked={includeComments}
              onChange={(event) => setIncludeComments(event.target.checked)}
              disabled={loading}
            />
            Include comment-like columns
          </label>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void handleRunScan()}
            disabled={!payload || payload.columns.length === 0 || loading}
          >
            {loading ? "Scanning..." : "Run column scan"}
          </button>
        </div>
      </div>

      {payload ? (
        <div className="column-scan-meta">
          <p className="meta">
            Columns: {payload.columns.length} · Experiment count hint:{" "}
            {payload.experimentCount ?? "n/a"}
          </p>
          {knownStructuralSummary.length > 0 && (
            <div className="chip-row">
              {knownStructuralSummary.map((item) => (
                <span key={item} className="chip">
                  {item}
                </span>
              ))}
            </div>
          )}
        </div>
      ) : (
        <p className="hint">
          Load a table and configure mapping to build the column summary for scanning.
        </p>
      )}

      {error && (
        <div className="inline-error">
          <p className="error-title">
            Column scan failed (requestId: {requestId ?? "n/a"})
          </p>
          <p className="meta">{error}</p>
          {errorDetails && <p className="meta">{errorDetails}</p>}
        </div>
      )}

      {result && (
        <div className="inline-success">
          <p className="success-title">
            Column scan complete (requestId: {requestId ?? "n/a"})
          </p>
          <p className="meta">{result.notes}</p>
          {result.factorCandidates.length > 0 && (
            <div className="chip-row">
              {result.factorCandidates.map((candidate) => (
                <span key={candidate} className="chip">
                  {candidate}
                </span>
              ))}
            </div>
          )}
          {result.uncertainties.length > 0 && (
            <ul className="meta-list">
              {result.uncertainties.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {(lastPayload || lastModelOutput) && (
        <div className="column-scan-debug">
          {lastPrompt && (
            <div className="debug-box">
              <h6>LLM prompt (system)</h6>
              <pre>{lastPrompt.system ?? "n/a"}</pre>
              <h6>LLM prompt (user)</h6>
              <pre>{lastPrompt.user ?? "n/a"}</pre>
            </div>
          )}
          {lastPayload && (
            <div className="debug-box">
              <h6>LLM input</h6>
              <pre>{JSON.stringify(lastPayload, null, 2)}</pre>
            </div>
          )}
          {lastModelOutput && (
            <div className="debug-box">
              <h6>LLM response</h6>
              <pre>{lastModelOutput}</pre>
            </div>
          )}
        </div>
      )}

      {payload && (
        <div className="column-scan-results">
          <div className="column-scan-results-header">
            <div>
              <h5>Column suggestions</h5>
              <p className="meta">
                Pre-checked columns come from the model. Adjust the final list before applying.
              </p>
            </div>
            {result && (
              <span className="badge">
                Suggested: {result.selectedColumns.length}/{payload.columns.length}
              </span>
            )}
          </div>

          <div className="column-scan-list">
            {payload.columns.map((column) => {
              const role = result?.columnRoles[column.name];
              const checked = selectedColumnsFinal.includes(column.name);
              return (
                <label key={column.name} className="column-row">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleColumn(column.name)}
                    disabled={loading}
                  />
                  <div className="column-row-body">
                    <div className="column-row-header">
                      <span className="column-name">{column.name}</span>
                      {role && <span className={`role-badge role-${role}`}>{roleLabels[role]}</span>}
                    </div>
                    <p className="meta">
                      {column.typeHeuristic} · {formatRatio(column.nonNullRatio)}
                    </p>
                    {column.examples.length > 0 && (
                      <div className="chip-row">
                        {column.examples.map((example, index) => (
                          <span key={`${column.name}-example-${index}`} className="chip">
                            {example}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </label>
              );
            })}
          </div>

          {selectedColumnsFinal.length > 0 && (
            <p className="meta">
              Final selection: {selectedColumnsFinal.join(", ")}
            </p>
          )}
        </div>
      )}
    </div>
  );
};
