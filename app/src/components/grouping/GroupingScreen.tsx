import { useEffect, useMemo, useState } from "react";
import type { Experiment } from "../../types/experiment";

export type ColumnScanPayload = {
  columns: {
    name: string;
    typeHeuristic: "numeric" | "text" | "mixed";
    nonNullRatio: number;
    examples?: string[];
  }[];
  experimentCount?: number | null;
  knownStructuralColumns: string[];
};

type ColumnScanResult = {
  selectedColumns: string[];
  columnRoles: Record<string, "condition" | "comment" | "noise">;
  factorCandidates: string[];
  notes: string;
  uncertainties: string[];
};

type ColumnScanResponse =
  | { ok: true; requestId: string; result: ColumnScanResult }
  | { ok: false; requestId: string; error?: string; details?: string };

type GroupingScreenProps = {
  experiments: Experiment[];
  columnScanPayload: ColumnScanPayload | null;
};

const mockColumnScanPayload: ColumnScanPayload = {
  columns: [
    {
      name: "Catalyst_used",
      typeHeuristic: "text",
      nonNullRatio: 0.95,
      examples: ["Pd/C", "Pd on C", "Pd/C reused"]
    },
    {
      name: "Additive",
      typeHeuristic: "text",
      nonNullRatio: 0.82,
      examples: ["NaOAc", "KOAc", "K2CO3"]
    },
    { name: "Temp_C", typeHeuristic: "numeric", nonNullRatio: 1 },
    { name: "Run_notes", typeHeuristic: "text", nonNullRatio: 0.6 }
  ],
  experimentCount: 80,
  knownStructuralColumns: ["experimentId", "time", "signal"]
};

const roleTone: Record<string, string> = {
  condition: "role-condition",
  comment: "role-comment",
  noise: "role-noise"
};

export const GroupingScreen = ({ experiments, columnScanPayload }: GroupingScreenProps) => {
  const [includeComments, setIncludeComments] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [result, setResult] = useState<ColumnScanResult | null>(null);
  const [selectedColumnsFinal, setSelectedColumnsFinal] = useState<string[]>([]);

  const payload = columnScanPayload ?? mockColumnScanPayload;

  useEffect(() => {
    setIncludeComments(false);
    setError(null);
    setRequestId(null);
    setResult(null);
    setSelectedColumnsFinal([]);
  }, [payload]);

  const allColumnNames = useMemo(() => payload.columns.map((column) => column.name), [payload]);

  const roleForColumn = (name: string): string | undefined => result?.columnRoles?.[name];

  const handleSelectFinal = (name: string) => {
    setSelectedColumnsFinal((prev) =>
      prev.includes(name) ? prev.filter((item) => item !== name) : [...prev, name]
    );
  };

  const handleColumnScan = async () => {
    setLoading(true);
    setError(null);
    setRequestId(null);
    setResult(null);

    try {
      const response = await fetch("/api/column-scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...payload,
          includeComments
        })
      });

      const contentType = response.headers.get("content-type");
      const isJson = typeof contentType === "string" && contentType.includes("application/json");
      const data: ColumnScanResponse | string | null = isJson ? await response.json() : await response.text();

      if (!response.ok || typeof data !== "object" || data === null || (data as any).ok !== true) {
        const requestIdValue = typeof data === "object" && data !== null ? (data as any).requestId : "n/a";
        const detail = typeof data === "object" && data !== null ? (data as any).details : null;
        const errorMessage =
          typeof data === "object" && data !== null
            ? (data as any).error ?? response.statusText
            : response.statusText;

        setError(detail ? `${errorMessage}: ${detail}` : errorMessage);
        setRequestId(requestIdValue ?? "n/a");
        return;
      }

      const parsed = data as Extract<ColumnScanResponse, { ok: true }>;
      setRequestId(parsed.requestId);
      setResult(parsed.result);
      setSelectedColumnsFinal(parsed.result.selectedColumns);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error");
      setRequestId("n/a");
    } finally {
      setLoading(false);
    }
  };

  const renderResultSummary = () => {
    if (!result || !requestId) {
      return null;
    }

    return (
      <div className="column-scan-summary">
        <div>
          <p className="meta">Request ID</p>
          <p className="summary-strong">{requestId}</p>
        </div>
        <div>
          <p className="meta">Notes</p>
          <p>{result.notes || "No notes returned."}</p>
        </div>
        {result.uncertainties.length > 0 && (
          <div>
            <p className="meta">Uncertainties</p>
            <ul>
              {result.uncertainties.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        )}
        {result.factorCandidates.length > 0 && (
          <div className="chip-row">
            {result.factorCandidates.map((factor) => (
              <span key={factor} className="chip">
                {factor}
              </span>
            ))}
          </div>
        )}
      </div>
    );
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
              <h4>Column scan</h4>
              <p className="meta">Send the current column summary to /api/column-scan.</p>
            </div>
            <div className="column-scan-controls">
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={includeComments}
                  onChange={(event) => setIncludeComments(event.target.checked)}
                />
                Include comments
              </label>
              <button type="button" className="primary" onClick={() => void handleColumnScan()} disabled={loading}>
                {loading ? "Scanning..." : "Run column scan"}
              </button>
            </div>
          </div>
          <div className="column-scan-meta">
            <p className="meta">
              Columns: {payload.columns.length} · Experiment count hint: {payload.experimentCount ?? "n/a"}
            </p>
            {payload.knownStructuralColumns.length > 0 && (
              <div className="chip-row">
                {payload.knownStructuralColumns.map((name) => (
                  <span key={name} className="chip">
                    Structural: {name}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="column-scan-grid">
            <div className="column-list">
              <div className="column-list-header">
                <p className="meta">Columns</p>
                <p className="meta">Pre-checks from model</p>
              </div>
              <ul>
                {payload.columns.map((column) => {
                  const role = roleForColumn(column.name);
                  const isChecked = selectedColumnsFinal.includes(column.name);
                  return (
                    <li key={column.name} className="column-list-row">
                      <label className="checkbox-row">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleSelectFinal(column.name)}
                        />
                        <div>
                          <div className="column-title">
                            <span>{column.name}</span>
                            {role && <span className={`role-badge ${roleTone[role] ?? ""}`}>{role}</span>}
                          </div>
                          <p className="meta">
                            {column.typeHeuristic} · Non-null {(column.nonNullRatio * 100).toFixed(0)}%
                            {column.examples?.length ? ` · e.g. ${column.examples.slice(0, 2).join(", ")}` : ""}
                          </p>
                        </div>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </div>
            <div className="column-scan-result">
              <h5>Result</h5>
              {renderResultSummary()}
              {!result && !error && <p className="hint">Run the scan to view suggested columns.</p>}
              {error && (
                <div className="inline-error">
                  <p className="error-title">Column scan failed {requestId ? `(requestId: ${requestId})` : ""}</p>
                  <p className="meta">{error}</p>
                </div>
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
