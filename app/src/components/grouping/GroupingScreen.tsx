import { useEffect, useMemo, useState } from "react";
import type { ColumnScanPayload, ColumnScanResult } from "../../types/columnScan";
import type { Experiment } from "../../types/experiment";

type GroupingScreenProps = {
  experiments: Experiment[];
  columnScanPayload: ColumnScanPayload | null;
};

const roleTone: Record<ColumnScanResult["columnRoles"][string], string> = {
  condition: "role-condition",
  comment: "role-comment",
  noise: "role-noise"
};

const formatNonNullRatio = (value: number): string =>
  `${Math.round(Math.min(1, Math.max(0, value)) * 100)}% non-null`;

export const GroupingScreen = ({ experiments, columnScanPayload }: GroupingScreenProps) => {
  const [includeComments, setIncludeComments] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [result, setResult] = useState<ColumnScanResult | null>(null);
  const [selectedColumnsFinal, setSelectedColumnsFinal] = useState<string[]>([]);

  const columnSummaries = useMemo(
    () => columnScanPayload?.request.columns ?? [],
    [columnScanPayload?.request]
  );
  const knownStructuralColumns = useMemo(
    () => columnScanPayload?.request.knownStructuralColumns ?? [],
    [columnScanPayload?.request.knownStructuralColumns]
  );
  const availableColumns = useMemo(
    () => new Set(columnSummaries.map((column) => column.name)),
    [columnSummaries]
  );

  useEffect(() => {
    setResult(null);
    setError(null);
    setRequestId(null);
    setSelectedColumnsFinal([]);
  }, [columnScanPayload?.request]);

  useEffect(() => {
    if (!result) {
      return;
    }
    const filteredSelection = result.selectedColumns.filter((name) =>
      availableColumns.has(name)
    );
    setSelectedColumnsFinal(filteredSelection);
  }, [availableColumns, result]);

  const handleColumnToggle = (name: string) => {
    setSelectedColumnsFinal((prev) =>
      prev.includes(name) ? prev.filter((item) => item !== name) : [...prev, name]
    );
  };

  const handleColumnScan = async () => {
    if (!columnScanPayload?.request) {
      setError("No column summary available.");
      return;
    }
    setLoading(true);
    setError(null);
    setRequestId(null);
    setResult(null);

    try {
      const payloadToSend = {
        ...columnScanPayload.request,
        includeComments
      };
      const response = await fetch("/api/column-scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payloadToSend)
      });

      const contentType = response.headers.get("content-type") ?? "";
      const isJson = contentType.includes("application/json");
      const data: any = isJson ? await response.json() : await response.text();
      const responseId =
        typeof data === "object" && data !== null && typeof data.requestId === "string"
          ? data.requestId
          : null;
      setRequestId(responseId);

      if (!response.ok || typeof data !== "object" || data === null || data.ok !== true) {
        const errorMessage =
          typeof data === "string"
            ? data
            : typeof data?.error === "string"
              ? data.error
              : "Column scan failed";
        const details =
          typeof data === "object" && data !== null && typeof data.details === "string"
            ? data.details
            : null;
        setError(details ? `${errorMessage} (${details})` : errorMessage);
        return;
      }

      if (!data.result) {
        setError("Missing result in response.");
        return;
      }

      const responseResult = data.result as ColumnScanResult;
      setResult(responseResult);
      const filteredSelection = responseResult.selectedColumns.filter((name: string) =>
        availableColumns.has(name)
      );
      setSelectedColumnsFinal(filteredSelection);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="grouping-screen">
      <header>
        <h3>Grouping preview</h3>
        <p className="meta">Experiments ready for grouping and downstream analysis.</p>
      </header>

      <div className="grouping-actions">
        <div className="experiment-card column-scan-card">
          <div className="column-scan-header">
            <div>
              <h4>LLM column scan</h4>
              <p className="meta">
                Send the current column summary to /api/column-scan and review the suggested
                selections.
              </p>
            </div>
            <div className="column-scan-controls">
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={includeComments}
                  onChange={(event) => setIncludeComments(event.target.checked)}
                />
                <span>Include comment-like columns</span>
              </label>
              <button
                type="button"
                className="primary"
                onClick={() => void handleColumnScan()}
                disabled={!columnSummaries.length || loading}
              >
                {loading ? "Scanning..." : "Run column scan"}
              </button>
            </div>
          </div>

          <div className="column-scan-meta">
            <p className="meta">
              Columns: {columnSummaries.length} · Experiment count hint:{" "}
              {columnScanPayload?.request.experimentCount ?? "n/a"}
            </p>
            <div className="chip-row">
              <span className="chip">Source: {columnScanPayload?.source ?? "n/a"}</span>
              <span className="chip">
                Comments: {includeComments ? "allowed" : "excluded unless critical"}
              </span>
              {knownStructuralColumns.length > 0 && (
                <span className="chip">
                  Structural: {knownStructuralColumns.slice(0, 4).join(", ")}
                  {knownStructuralColumns.length > 4 ? "…" : ""}
                </span>
              )}
            </div>
          </div>

          {error && (
            <div className="inline-error">
              <p className="error-title">
                Column scan failed {requestId ? `(requestId: ${requestId})` : ""}
              </p>
              <p className="meta">{error}</p>
            </div>
          )}

          {result && (
            <div className="inline-success">
              <p className="success-title">
                Column scan OK (requestId: {requestId ?? "n/a"})
              </p>
              <p className="meta">Review the suggested roles and adjust the final selection.</p>
            </div>
          )}

          <div className="column-scan-grid">
            <div className="column-scan-side">
              <div className="notes-box">
                <div className="notes-header">
                  <h5>LLM notes</h5>
                  {result?.factorCandidates && result.factorCandidates.length > 0 && (
                    <div className="chip-row">
                      {result.factorCandidates.slice(0, 12).map((factor) => (
                        <span key={factor} className="chip">
                          {factor}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <p className="meta">
                  {result?.notes ?? "Run the scan to see model notes about column usefulness."}
                </p>
                {result?.uncertainties?.length ? (
                  <ul className="note-list">
                    {result.uncertainties.map((item) => (
                      <li key={item} className="note-item">
                        {item}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="hint">No uncertainties provided.</p>
                )}
              </div>
              <div className="notes-box">
                <div className="notes-header">
                  <h5>Final selection</h5>
                  <p className="meta">
                    {selectedColumnsFinal.length} of {columnSummaries.length} columns selected
                  </p>
                </div>
                {selectedColumnsFinal.length > 0 ? (
                  <div className="chip-row">
                    {selectedColumnsFinal.map((name) => (
                      <span key={name} className="chip strong-chip">
                        {name}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="hint">No columns selected yet.</p>
                )}
              </div>
            </div>
            <div className="column-list">
              {columnSummaries.length === 0 ? (
                <p className="hint">Load a table or use the mock payload to run a scan.</p>
              ) : (
                columnSummaries.map((column) => {
                  const role = result?.columnRoles?.[column.name];
                  return (
                    <label key={column.name} className="column-row">
                      <div className="column-row-main">
                        <input
                          type="checkbox"
                          checked={selectedColumnsFinal.includes(column.name)}
                          onChange={() => handleColumnToggle(column.name)}
                        />
                        <div>
                          <div className="column-title">
                            <span>{column.name}</span>
                            {role && <span className={`role-badge ${roleTone[role]}`}>{role}</span>}
                          </div>
                          <p className="meta">
                            {column.typeHeuristic} · {formatNonNullRatio(column.nonNullRatio)}
                          </p>
                          {column.examples && column.examples.length > 0 && (
                            <p className="meta examples-line">
                              Examples: {column.examples.slice(0, 3).join(", ")}
                            </p>
                          )}
                        </div>
                      </div>
                    </label>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>

      {experiments.length === 0 ? (
        <div className="empty-state">
          <h3>No experiments to group</h3>
          <p>Import data and complete mapping to review grouping suggestions.</p>
        </div>
      ) : (
        <ul className="experiment-list">
          {experiments.map((experiment) => {
            const metadataKeys = Object.keys(experiment.metaRaw);
            return (
              <li key={experiment.experimentId} className="experiment-card">
                <div>
                  <h4>{experiment.name ?? "Untitled experiment"}</h4>
                  <p className="meta">
                    Series: {experiment.series.length} · Metadata keys: {metadataKeys.length}
                  </p>
                </div>
                {metadataKeys.length > 0 && (
                  <div className="meta">
                    {metadataKeys.slice(0, 3).map((key) => (
                      <span key={key} className="chip">
                        {key}: {String(experiment.metaRaw[key])}
                      </span>
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
};
