import { useState } from "react";
import type { Experiment } from "../../types/experiment";

type GroupingScreenProps = {
  experiments: Experiment[];
  columns: string[];
  experimentCount: number | null;
  knownStructuralColumns: string[];
};

type ColumnScanState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; requestId: string }
  | { status: "error"; requestId?: string; message?: string };

export const GroupingScreen = ({
  experiments,
  columns,
  experimentCount,
  knownStructuralColumns
}: GroupingScreenProps) => {
  const [columnScanState, setColumnScanState] = useState<ColumnScanState>({ status: "idle" });

  if (import.meta.env.DEV) {
    console.info("[grouping] first experiment shape", experiments?.[0]);
  }

  if (experiments.length === 0) {
    return (
      <div className="empty-state">
        <h3>No experiments to group</h3>
        <p>Import data and complete mapping to review grouping suggestions.</p>
      </div>
    );
  }

  const handleColumnScan = async () => {
    setColumnScanState({ status: "loading" });
    try {
      const response = await fetch("/api/column-scan", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          columns,
          experimentCount,
          knownStructuralColumns
        })
      });

      const json = await response.json();
      if (!response.ok || !json?.ok) {
        setColumnScanState({
          status: "error",
          requestId: json?.requestId,
          message: json?.error ?? "Column scan failed"
        });
        return;
      }

      setColumnScanState({ status: "success", requestId: json.requestId });
    } catch (error) {
      setColumnScanState({
        status: "error",
        message: error instanceof Error ? error.message : "Unexpected error"
      });
    }
  };

  return (
    <section className="grouping-screen">
      <header>
        <h3>Grouping preview</h3>
        <p className="meta">Experiments ready for grouping and downstream analysis.</p>
      </header>
      <div className="inline-success">
        <p className="success-title">Column scan ping</p>
        <p className="meta">
          POST /api/column-scan with {columns.length} columns · experimentCount{" "}
          {experimentCount ?? "n/a"}
        </p>
        <button
          type="button"
          className="primary"
          onClick={() => void handleColumnScan()}
          disabled={columnScanState.status === "loading"}
        >
          {columnScanState.status === "loading" ? "Pinging..." : "Ping column scan API"}
        </button>
        {columnScanState.status === "success" && (
          <p className="meta">
            Column scan ping OK (requestId: {columnScanState.requestId})
          </p>
        )}
        {columnScanState.status === "error" && (
          <p className="meta">
            Column scan ping failed
            {columnScanState.requestId ? ` (requestId: ${columnScanState.requestId})` : ""}:{" "}
            {columnScanState.message ?? "Unknown error"}
          </p>
        )}
      </div>
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
    </section>
  );
};
