import { useEffect, useMemo, useState } from "react";
import type { Experiment } from "../../types/experiment";
import {
  DeviationClient,
  collectExperimentComments,
  analyzeExperimentForDeviations
} from "../../lib/deviations/client";
import type { DeviationAnalysis } from "../../lib/deviations/types";

type RunStatus = "queued" | "running" | "complete" | "error" | "fallback";

type ExperimentRunState = {
  status: RunStatus;
  result?: DeviationAnalysis;
  error?: string;
  requestId?: string | null;
};

type DeviationScreenProps = {
  experiments: Experiment[];
  onAudit?: (type: string, payload: Record<string, unknown>) => void;
};

const statusLabel: Record<RunStatus, string> = {
  queued: "Wartet",
  running: "Läuft",
  complete: "Fertig",
  error: "Fehler",
  fallback: "Fallback"
};

const defaultClient = new DeviationClient({ model: "gpt-5.2-mini" });

export const DeviationScreen = ({ experiments, onAudit }: DeviationScreenProps) => {
  const [runStates, setRunStates] = useState<Record<string, ExperimentRunState>>({});
  const [isRunning, setIsRunning] = useState(false);

  useEffect(() => {
    const initialState: Record<string, ExperimentRunState> = {};
    experiments.forEach((experiment) => {
      initialState[experiment.experimentId] = { status: "queued" };
    });
    setRunStates(initialState);
    setIsRunning(false);
  }, [experiments]);

  const client = useMemo(() => defaultClient, []);

  const updateState = (experimentId: string, next: Partial<ExperimentRunState>) => {
    setRunStates((prev) => ({
      ...prev,
      [experimentId]: { ...(prev[experimentId] ?? { status: "queued" }), ...next }
    }));
  };

  const recordAudit = (type: string, payload: Record<string, unknown>) => {
    if (onAudit) {
      onAudit(type, payload);
    }
  };

  const handleRunAll = async () => {
    setIsRunning(true);
    for (const experiment of experiments) {
      updateState(experiment.experimentId, { status: "running", error: undefined });
      recordAudit("DEVIATION_REQUESTED", {
        experimentId: experiment.experimentId,
        experimentName: experiment.name,
        model: "gpt-5.2-mini",
        mode: "per-experiment",
        categories: "ontology_v1"
      });

      try {
        const response = await client.analyzeExperiment({ experiment });
        updateState(experiment.experimentId, {
          status: "complete",
          result: response.result,
          requestId: response.requestId ?? undefined
        });
        recordAudit("DEVIATION_RESULT", {
          experimentId: experiment.experimentId,
          experimentName: experiment.name,
          model: response.result.model,
          categories: response.result.categories.map((item) => item.category),
          requestId: response.requestId ?? null
        });
      } catch (error) {
        const fallback = analyzeExperimentForDeviations({ experiment });
        if (fallback.categories.length === 0) {
          updateState(experiment.experimentId, {
            status: "error",
            error: error instanceof Error ? error.message : "Deviation check failed"
          });
          recordAudit("DEVIATION_FAILED", {
            experimentId: experiment.experimentId,
            message: error instanceof Error ? error.message : "unknown error"
          });
        } else {
          updateState(experiment.experimentId, {
            status: "fallback",
            result: fallback
          });
          recordAudit("DEVIATION_FALLBACK", {
            experimentId: experiment.experimentId,
            categories: fallback.categories.map((item) => item.category),
            summary: fallback.summary
          });
        }
      }
    }
    setIsRunning(false);
  };

  const handleReset = () => {
    const resetState: Record<string, ExperimentRunState> = {};
    experiments.forEach((experiment) => {
      resetState[experiment.experimentId] = { status: "queued" };
    });
    setRunStates(resetState);
  };

  const renderResult = (run: ExperimentRunState, experiment: Experiment) => {
    if (!run.result) {
      return (
        <p className="meta">
          {run.error ??
            "LLM-Auswertung noch nicht gestartet. Kommentare werden pro Experiment gesammelt."}
        </p>
      );
    }
    return (
      <div className="deviation-result">
        <p className="meta">Modell: {run.result.model}</p>
        <p>{run.result.summary}</p>
        {run.result.categories.length > 0 ? (
          <ul className="meta-list">
            {run.result.categories.map((item) => (
              <li key={`${experiment.experimentId}-${item.category}`}>
                <strong>{item.category}</strong> ({item.severity}) · {item.rationale}
              </li>
            ))}
          </ul>
        ) : (
          <p className="meta">Keine Kategorien erkannt.</p>
        )}
        {run.requestId && <p className="meta">RequestId: {run.requestId}</p>}
      </div>
    );
  };

  return (
    <section className="deviation-screen">
      <header className="section-intro">
        <p className="eyebrow">Schritt 3 · Abweichungen (LLM)</p>
        <h3>Kommentare pro Experiment prüfen</h3>
        <p className="muted">
          Pro Experiment wird genau ein LLM-Call mit verankerten Ontologie-Kategorien ausgeführt.
          Bei Fehlern oder Timeout fällt der Client auf eine heuristische Analyse zurück.
        </p>
        <div className="action-row">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void handleRunAll()}
            disabled={experiments.length === 0 || isRunning}
          >
            {isRunning ? "Wird geprüft..." : "Abweichungen prüfen"}
          </button>
          <button type="button" className="btn btn-ghost" onClick={handleReset} disabled={isRunning}>
            Zurücksetzen
          </button>
          <span className="pill">
            Experimente: {experiments.length} · Status:{" "}
            {Object.values(runStates).filter((state) => state.status === "complete").length}/
            {experiments.length} fertig
          </span>
        </div>
      </header>

      {experiments.length === 0 ? (
        <div className="empty-state">
          <h4>Keine Experimente geladen</h4>
          <p className="muted">Importiere Daten und schließe die Validierung ab.</p>
        </div>
      ) : (
        <ul className="experiment-list">
          {experiments.map((experiment) => {
            const run = runStates[experiment.experimentId] ?? { status: "queued" };
            const commentsPreview = collectExperimentComments(experiment)
              .map((item) => `${item.key}: ${item.value}`)
              .slice(0, 3);
            return (
              <li key={experiment.experimentId} className="experiment-card">
                <div className="experiment-card-header">
                  <div>
                    <h4>{experiment.name ?? "Experiment"}</h4>
                    <p className="meta">{experiment.experimentId}</p>
                  </div>
                  <span className={`badge status-${run.status}`}>{statusLabel[run.status]}</span>
                </div>
                <p className="muted">
                  {commentsPreview.join(" · ") || "Keine Kommentare hinterlegt."}
                </p>
                {renderResult(run, experiment)}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
};
