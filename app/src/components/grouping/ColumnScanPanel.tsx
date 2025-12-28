import { useEffect, useMemo, useState } from "react";
import type {
  ColumnRole,
  ColumnScanPayload,
  ColumnScanResult
} from "./columnScanTypes";

type ColumnScanPanelProps = {
  payload: ColumnScanPayload | null;
  fallbackPayload: ColumnScanPayload;
};

const roleLabel: Record<ColumnRole, string> = {
  condition: "Condition",
  comment: "Comment",
  noise: "Noise"
};

const roleTone: Record<ColumnRole, string> = {
  condition: "role-condition",
  comment: "role-comment",
  noise: "role-noise"
};

const safeContent = async (response: Response) => {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return { kind: "json", value: await response.json() };
  }
  return { kind: "text", value: await response.text() };
};

export const ColumnScanPanel = ({ payload, fallbackPayload }: ColumnScanPanelProps) => {
  const [includeComments, setIncludeComments] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [details, setDetails] = useState<string | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [result, setResult] = useState<ColumnScanResult | null>(null);
  const [selectedColumnsFinal, setSelectedColumnsFinal] = useState<string[]>([]);

  const activePayload = payload ?? fallbackPayload;
  const usingFallback = !payload;

  useEffect(() => {
    setError(null);
    setDetails(null);
    setRequestId(null);
    setResult(null);
    setSelectedColumnsFinal([]);
  }, [payload, fallbackPayload]);

  useEffect(() => {
    if (result) {
      setSelectedColumnsFinal(result.selectedColumns);
    }
  }, [result]);

  const allColumns = useMemo(() => {
    const names = new Set<string>();
    activePayload.columns.forEach((column) => names.add(column.name));
    if (result) {
      Object.keys(result.columnRoles).forEach((name) => names.add(name));
    }
    return Array.from(names);
  }, [activePayload.columns, result]);

  const handleSelectionToggle = (name: string) => {
    setSelectedColumnsFinal((prev) =>
      prev.includes(name) ? prev.filter((item) => item !== name) : [...prev, name]
    );
  };

  const runColumnScan = async () => {
    setLoading(true);
    setError(null);
    setDetails(null);
    setRequestId(null);
    try {
      const response = await fetch("/api/column-scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...activePayload,
          includeComments
        })
      });

      const parsed = await safeContent(response);
      const data = parsed.kind === "json" ? parsed.value : null;
      const responseRequestId = data?.requestId ?? null;
      setRequestId(responseRequestId);

      if (!response.ok || data?.ok !== true) {
        const message =
          data?.error ??
          (typeof parsed.value === "string" ? parsed.value : response.statusText);
        const detail = data?.details;
        setError(message ?? "Column scan failed");
        setDetails(detail ?? null);
        setResult(null);
        return;
      }

      if (!data.result) {
        setError("Column scan returned no result payload");
        return;
      }

      setResult(data.result as ColumnScanResult);
      setDetails(null);
      setSelectedColumnsFinal(data.result.selectedColumns ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error");
    } finally {
      setLoading(false);
    }
  };

  const formatRatio = (value: number) => `${Math.round(value * 100)}% non-null`;

  const renderRoleBadge = (name: string) => {
    const role = result?.columnRoles[name];
    if (!role) {
      return <span className="role-badge role-unknown">Unknown</span>;
    }
    return <span className={`role-badge ${roleTone[role]}`}>{roleLabel[role]}</span>;
  };

  return (
    <div className="experiment-card column-scan-panel">
      <div className="column-scan-header">
        <div>
          <h4>LLM Column Scan</h4>
          <p className="meta">
            Ask GPT-5.2 to propose condition-focused columns based on the current mapping
            context.
          </p>
          {usingFallback && (
            <p className="hint">
              Using sample columns until a parsed table is available. Real mapping data will
              replace this list automatically.
            </p>
          )}
        </div>
        <div className="column-scan-controls">
          <label className="checkbox-toggle">
            <input
              type="checkbox"
              checked={includeComments}
              onChange={(event) => setIncludeComments(event.target.checked)}
            />
            Include comment-like columns
          </label>
          <button
            type="button"
            className="primary"
            disabled={loading || activePayload.columns.length === 0}
            onClick={() => void runColumnScan()}
          >
            {loading ? "Running scan..." : "Run column scan"}
          </button>
        </div>
      </div>

      <div className="column-scan-meta">
        <p className="meta">
          Columns: {activePayload.columns.length} · Experiment count hint:{" "}
          {activePayload.experimentCount ?? "n/a"}
        </p>
        <div className="chip-row">
          {activePayload.knownStructuralColumns?.map((column) => (
            <span key={column} className="chip">
              Structural: {column}
            </span>
          ))}
          {activePayload.knownStructuralColumns?.length === 0 && (
            <span className="chip">No structural columns provided</span>
          )}
        </div>
      </div>

      {requestId && (
        <p className="meta request-id">Request ID: {requestId}</p>
      )}

      {error && (
        <div className="inline-error">
          <p className="error-title">
            Column scan failed{requestId ? ` (requestId: ${requestId})` : ""}
          </p>
          <p className="meta">{error}</p>
          {details && <p className="meta">{details}</p>}
        </div>
      )}

      {result && (
        <div className="column-scan-result">
          <div className="note-card">
            <h5>Notes</h5>
            <p>{result.notes}</p>
          </div>
          {result.uncertainties.length > 0 && (
            <div className="note-card">
              <h5>Uncertainties</h5>
              <ul className="uncertainty-list">
                {result.uncertainties.map((item, index) => (
                  <li key={`${item}-${index}`}>{item}</li>
                ))}
              </ul>
            </div>
          )}
          {result.factorCandidates.length > 0 && (
            <div className="factor-row">
              <p className="meta">Factor candidates</p>
              <div className="chip-row">
                {result.factorCandidates.map((factor) => (
                  <span key={factor} className="chip">
                    {factor}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="column-list">
        <header className="column-list-header">
          <h5>Columns</h5>
          <p className="meta">
            Pre-selected columns come from the LLM suggestion. Adjust your final pick before
            continuing.
          </p>
        </header>
        <ul>
          {allColumns.map((name) => {
            const column = activePayload.columns.find((item) => item.name === name);
            return (
              <li key={name} className="column-row">
                <label className="column-label">
                  <input
                    type="checkbox"
                    checked={selectedColumnsFinal.includes(name)}
                    onChange={() => handleSelectionToggle(name)}
                  />
                  <div className="column-info">
                    <div className="column-title">
                      <span className="column-name">{name}</span>
                      {renderRoleBadge(name)}
                    </div>
                    {column && (
                      <p className="meta">
                        {column.typeHeuristic} · {formatRatio(column.nonNullRatio)}
                      </p>
                    )}
                    {column?.examples && column.examples.length > 0 && (
                      <div className="chip-row">
                        {column.examples.map((example, idx) => (
                          <span key={`${name}-ex-${idx}`} className="chip">
                            {example}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </label>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
};
