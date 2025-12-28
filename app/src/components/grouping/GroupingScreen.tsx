import { useEffect, useState } from "react";
import type { Experiment } from "../../types/experiment";

export type ColumnScanPayload = {
  columns: string[];
  experimentCount: number | null;
  knownStructuralColumns: {
    time: string | null;
    values: string[];
    experiment: string | null;
    replicate: string | null;
  };
};

type ColumnScanStatus =
  | { kind: "success"; requestId: string; smokeTest?: boolean }
  | { kind: "error"; requestId: string; message?: string; smokeTest?: boolean }
  | null;

type GroupingScreenProps = {
  experiments: Experiment[];
  columnScanPayload: ColumnScanPayload | null;
};

const formatKnownColumns = (payload: ColumnScanPayload["knownStructuralColumns"]) => [
  ["Time", payload.time],
  ["Experiment", payload.experiment],
  ["Replicate", payload.replicate]
];

export const GroupingScreen = ({ experiments, columnScanPayload }: GroupingScreenProps) => {
  const [columnScanStatus, setColumnScanStatus] = useState<ColumnScanStatus>(null);
  const [isScanning, setIsScanning] = useState(false);

  useEffect(() => {
    setColumnScanStatus(null);
  }, [columnScanPayload]);

  const handleColumnScan = async (opts?: { smokeTest?: boolean }) => {
    if (!columnScanPayload) {
      return;
    }
    setIsScanning(true);
    setColumnScanStatus(null);
    try {
      const response = await fetch("/api/column-scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...columnScanPayload,
          smokeTest: opts?.smokeTest === true
        })
      });

      let data: any = null;
      try {
        data = await response.json();
      } catch {
        // keep data as null if JSON parsing fails
      }
      const requestId = data?.requestId ?? "n/a";
      const errorMessage = data?.details ?? data?.error ?? response.statusText;

      if (!response.ok || !data?.ok) {
        setColumnScanStatus(
          opts?.smokeTest
            ? {
                kind: "error",
                requestId,
                message: errorMessage,
                smokeTest: true
              }
            : {
                kind: "error",
                requestId,
                message: errorMessage
              }
        );
        return;
      }

      setColumnScanStatus(
        opts?.smokeTest ? { kind: "success", requestId, smokeTest: true } : { kind: "success", requestId }
      );
    } catch (error) {
      setColumnScanStatus({
        kind: "error",
        requestId: "n/a",
        message: error instanceof Error ? error.message : "Unexpected error",
        smokeTest: opts?.smokeTest
      });
    } finally {
      setIsScanning(false);
    }
  };

  if (import.meta.env.DEV) {
    console.info("[grouping] first experiment shape", experiments?.[0]);
  }

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
              <h4>Column scan connectivity</h4>
              <p className="meta">
                Ping the /api/column-scan endpoint with the current mapping context.
              </p>
            </div>
            <button
              type="button"
              className="primary"
              onClick={() => void handleColumnScan()}
              disabled={!columnScanPayload || isScanning}
            >
              {isScanning ? "Sending..." : "Ping column scan"}
            </button>
            {import.meta.env.DEV && (
              <button
                type="button"
                className="secondary"
                onClick={() => void handleColumnScan({ smokeTest: true })}
                disabled={!columnScanPayload || isScanning}
              >
                {isScanning ? "Testing..." : "Run OpenAI smoke test"}
              </button>
            )}
          </div>
          {columnScanPayload ? (
            <div className="column-scan-meta">
              <p className="meta">
                Columns: {columnScanPayload.columns.length} · Experiment count hint:{" "}
                {columnScanPayload.experimentCount ?? "n/a"}
              </p>
              <div className="chip-row">
                {formatKnownColumns(columnScanPayload.knownStructuralColumns).map(
                  ([label, value]) => (
                    <span key={label} className="chip">
                      {label}: {value ?? "n/a"}
                    </span>
                  )
                )}
                {columnScanPayload.knownStructuralColumns.values.length > 0 && (
                  <span className="chip">
                    Values: {columnScanPayload.knownStructuralColumns.values.join(", ")}
                  </span>
                )}
              </div>
            </div>
          ) : (
            <p className="hint">
              Load a table and configure mapping to enable the column scan ping.
            </p>
          )}

          {columnScanStatus?.kind === "success" && (
            <div className="inline-success">
              <p className="success-title">
                {columnScanStatus.smokeTest
                  ? "OpenAI smoke test OK"
                  : "Column scan ping OK"}{" "}
                (requestId: {columnScanStatus.requestId})
              </p>
              <p className="meta">
                {columnScanStatus.smokeTest
                  ? "The smoke test reached OpenAI and returned the expected JSON payload."
                  : "The serverless route responded with the expected JSON payload."}
              </p>
            </div>
          )}

          {columnScanStatus?.kind === "error" && (
            <div className="inline-error">
              <p className="error-title">
                {columnScanStatus.smokeTest
                  ? "OpenAI smoke test failed"
                  : "Column scan ping failed"}{" "}
                (requestId: {columnScanStatus.requestId})
              </p>
              {columnScanStatus.message && <p className="meta">{columnScanStatus.message}</p>}
            </div>
          )}
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
