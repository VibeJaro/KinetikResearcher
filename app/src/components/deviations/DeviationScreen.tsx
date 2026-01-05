import { useEffect, useMemo, useState } from "react";
import type { Experiment } from "../../types/experiment";
import type {
  DeviationAnalysisRequest,
  DeviationObservation,
  DeviationOntologyItem,
  ExperimentDeviationResult
} from "../../types/deviations";
import type { ColumnScanPayload } from "../../types/columnScan";

type DeviationScreenProps = {
  experiments: Experiment[];
  columnScanPayload: ColumnScanPayload | null;
};

type DeviationRunState = {
  requestId: string;
  status: "idle" | "running" | "error" | "done";
  error?: string;
};

const deviationOntology: DeviationOntologyItem[] = [
  {
    key: "apparatus_issue",
    label: "Apparatur- oder Anlagenprobleme",
    icon: "⚙️",
    description: "Leckagen, Druckverlust, defekte Bauteile oder undichte Leitungen."
  },
  {
    key: "dosing_mode",
    label: "Abweichender Dosiermodus",
    icon: "🧪",
    description: "Portionsweise/verteilt/ungewöhnliche Zugabe von Edukten/Reagenzien."
  },
  {
    key: "temp_pressure_instability",
    label: "Temperatur- oder Druckinstabilität",
    icon: "🌡️",
    description: "Schwankungen oder Probleme beim Halten von Temperatur oder Druck."
  },
  {
    key: "sequence_change",
    label: "Geänderte Reihenfolge / Ablauf",
    icon: "🔄",
    description: "Andere Reihenfolge oder bewusst veränderter Versuchsablauf."
  },
  {
    key: "material_quality",
    label: "Materialqualität / Verunreinigung",
    icon: "🧴",
    description: "Feuchtigkeit, falsche Qualität, unerwartete Nebenstoffe."
  },
  {
    key: "unexpected_event",
    label: "Unerwartetes Ereignis",
    icon: "⚠️",
    description: "Abbruch, Notabschaltung, starke Gasentwicklung, Verfärbungen."
  },
  {
    key: "explicit_warning",
    label: "Explizite Warnung",
    icon: "❗",
    description: "Autor weist auf eingeschränkte Interpretierbarkeit hin."
  },
  {
    key: "workup_change",
    label: "Geänderter Aufarbeitungs-/Isolationsschritt",
    icon: "🧹",
    description: "Andere Quench/Extraktion/Filtration/Destillation/Trocknung."
  },
  {
    key: "analytics_issue",
    label: "Probleme bei Analytik oder Probenahme",
    icon: "🔬",
    description: "Fehlerhafte Messungen, unklare Daten, Probenverlust."
  },
  {
    key: "comment_parameters",
    label: "Zentrale Parameter im Kommentar",
    icon: "📌",
    description: "Wichtige Stoffidentitäten/Mengen/Bedingungen im Kommentar genannt."
  }
];

const defaultBadgeForCategory: Record<string, string> = {
  apparatus_issue: "⚙️",
  dosing_mode: "🧪",
  temp_pressure_instability: "🌡️",
  sequence_change: "🔄",
  material_quality: "🧴",
  unexpected_event: "⚠️",
  explicit_warning: "❗",
  workup_change: "🧹",
  analytics_issue: "🔬",
  comment_parameters: "📌"
};

const formatValue = (value: string | number | null | undefined): string => {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return Number.isFinite(value) ? value.toString() : "";
  return value.toString().trim();
};

export const DeviationScreen = ({ experiments, columnScanPayload }: DeviationScreenProps) => {
  const [commentColumns, setCommentColumns] = useState<string[]>([]);
  const [parameterColumns, setParameterColumns] = useState<string[]>([]);
  const [results, setResults] = useState<ExperimentDeviationResult[]>([]);
  const [runState, setRunState] = useState<DeviationRunState>({
    requestId: "",
    status: "idle"
  });
  const [filter, setFilter] = useState<"all" | "clean" | "dosing">("all");

  useEffect(() => {
    if (!columnScanPayload) {
      setCommentColumns([]);
      setParameterColumns([]);
      return;
    }
    const structural = new Set(columnScanPayload.knownStructuralColumns);
    const commentDefaults = columnScanPayload.columns
      .filter((col) => col.typeHeuristic !== "numeric" && !structural.has(col.name))
      .slice(0, 2)
      .map((col) => col.name);
    const parameterDefaults = columnScanPayload.columns
      .filter((col) => col.typeHeuristic !== "text" && !structural.has(col.name))
      .slice(0, 3)
      .map((col) => col.name);
    setCommentColumns(commentDefaults);
    setParameterColumns(parameterDefaults);
  }, [columnScanPayload]);

  const selectableColumns = useMemo(() => {
    if (!columnScanPayload) return [];
    const structural = new Set(columnScanPayload.knownStructuralColumns);
    return columnScanPayload.columns.filter((column) => !structural.has(column.name));
  }, [columnScanPayload]);

  const filteredResults = useMemo(() => {
    if (filter === "clean") {
      return results.filter((item) => item.observations.length === 0);
    }
    if (filter === "dosing") {
      return results.filter((item) =>
        item.observations.some((obs) => obs.category === "dosing_mode")
      );
    }
    return results;
  }, [filter, results]);

  const toggleColumn = (value: string, target: "comment" | "parameter") => {
    const setter = target === "comment" ? setCommentColumns : setParameterColumns;
    setter((prev) => (prev.includes(value) ? prev.filter((item) => item !== value) : [...prev, value]));
  };

  const buildRequestPayload = (experiment: Experiment): DeviationAnalysisRequest | null => {
    const commentContext: Record<string, string> = {};
    const parameterEcho: Record<string, string | number | null> = {};

    commentColumns.forEach((col) => {
      const value = formatValue(experiment.metaRaw[col]);
      if (value) {
        commentContext[col] = value;
      }
    });

    parameterColumns.forEach((col) => {
      const value = experiment.metaRaw[col] ?? null;
      if (value !== undefined) {
        parameterEcho[col] = value;
      }
    });

    return {
      experimentId: experiment.experimentId,
      experimentName: experiment.name,
      commentColumns,
      parameterColumns,
      commentContext,
      parameterEcho,
      ontology: deviationOntology
    };
  };

  const runAnalysis = async () => {
    if (!columnScanPayload || experiments.length === 0) return;
    if (commentColumns.length === 0 || parameterColumns.length === 0) {
      setRunState({
        requestId: "",
        status: "error",
        error: "Bitte wähle mindestens eine Kommentar- und eine Parameter-Spalte aus."
      });
      return;
    }
    const requestId = `dev-${Date.now()}`;
    setRunState({ requestId, status: "running" });
    const nextResults: ExperimentDeviationResult[] = [];

    for (const experiment of experiments) {
      const payload = buildRequestPayload(experiment);
      if (!payload) continue;
      try {
        const response = await fetch("/api/deviation-analysis", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        const data = await response.json();
        if (!response.ok || !data?.ok) {
          nextResults.push({
            experimentId: experiment.experimentId,
            experimentName: experiment.name,
            observations: [],
            commentContext: payload.commentContext ?? {},
            parameterEcho: payload.parameterEcho ?? {}
          });
          continue;
        }
        nextResults.push(data.result as ExperimentDeviationResult);
      } catch (error) {
        console.error("[deviation-analysis] failed", error);
        nextResults.push({
          experimentId: experiment.experimentId,
          experimentName: experiment.name,
          observations: [],
          commentContext: payload.commentContext ?? {},
          parameterEcho: payload.parameterEcho ?? {}
        });
      }
    }

    setResults(nextResults);
    setRunState({ requestId, status: "done" });
  };

  const renderObservationBadges = (observations: DeviationObservation[]) => {
    if (observations.length === 0) {
      return <span className="badge soft">Keine Auffälligkeiten</span>;
    }
    return (
      <div className="chip-row">
        {observations.map((obs, index) => (
          <span key={`${obs.category}-${index}`} className="chip emphasis">
            <span aria-hidden>{defaultBadgeForCategory[obs.category] ?? "⚠️"}</span>
            {obs.category}
          </span>
        ))}
      </div>
    );
  };

  return (
    <section className="deviation-screen">
      <header className="screen-header">
        <div>
          <p className="eyebrow">Schritt 3 · Abweichungsanalyse (LLM)</p>
          <h3>Kommentarspalten wählen und Auffälligkeiten je Experiment prüfen</h3>
          <p className="meta">
            Das LLM liest pro Experiment die Kommentarspalten, erkennt nur die 10 definierten
            Auffälligkeitstypen und markiert die Textstellen. Keine Bewertungen, nur Hinweise.
          </p>
        </div>
        <div className="pill soft">LLM pro Experiment</div>
      </header>

      <div className="card deviation-card">
        <div className="card-body deviation-grid">
          <div className="field">
            <h4>Kommentarspalten</h4>
            <p className="meta">Wo stehen Hinweise auf Abweichungen? (z. B. Bemerkung, Kommentar)</p>
            <div className="select-list">
              {selectableColumns.map((column) => (
                <label key={column.name} className="checkbox">
                  <input
                    type="checkbox"
                    checked={commentColumns.includes(column.name)}
                    onChange={() => toggleColumn(column.name, "comment")}
                  />
                  <span>{column.name}</span>
                  <span className="meta">· {column.typeHeuristic}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="field">
            <h4>Parameter-Spalten</h4>
            <p className="meta">Kerndaten (Temperatur, Edukt, Additiv, Lösemittel …) für Kontext.</p>
            <div className="select-list">
              {selectableColumns.map((column) => (
                <label key={column.name} className="checkbox">
                  <input
                    type="checkbox"
                    checked={parameterColumns.includes(column.name)}
                    onChange={() => toggleColumn(column.name, "parameter")}
                  />
                  <span>{column.name}</span>
                  <span className="meta">· {column.typeHeuristic}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="card-footer deviation-actions">
          <div className="chip-row">
            <span className="chip">Experimente: {experiments.length || "n/a"}</span>
            <span className="chip">Kommentarspalten: {commentColumns.length || "–"}</span>
            <span className="chip">Parameter: {parameterColumns.length || "–"}</span>
          </div>
          <div className="action-row">
            <div className="chip-row">
              <button
                type="button"
                className={`pill filter ${filter === "clean" ? "active" : ""}`}
                onClick={() => setFilter("clean")}
              >
                Nur Versuche ohne Auffälligkeiten
              </button>
              <button
                type="button"
                className={`pill filter ${filter === "dosing" ? "active" : ""}`}
                onClick={() => setFilter("dosing")}
              >
                Zeig mir alle mit Dosierabweichung
              </button>
              <button
                type="button"
                className={`pill filter ${filter === "all" ? "active" : ""}`}
                onClick={() => setFilter("all")}
              >
                Alle anzeigen
              </button>
            </div>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void runAnalysis()}
              disabled={runState.status === "running" || experiments.length === 0}
            >
              {runState.status === "running" ? "Analyse läuft…" : "LLM-Analyse starten"}
            </button>
          </div>
          {runState.status === "error" && <p className="error-text">{runState.error}</p>}
          {runState.status === "running" && (
            <p className="meta">
              LLM prüft Experimente sequentiell… ({commentColumns.length} Kommentarspalten,{" "}
              {parameterColumns.length} Parameter)
            </p>
          )}
        </div>
      </div>

      <div className="ontology-grid">
        {deviationOntology.map((item) => (
          <div key={item.key} className="ontology-card">
            <div className="ontology-icon" aria-hidden>
              {item.icon}
            </div>
            <div>
              <p className="meta">{item.label}</p>
              <p className="hint">{item.description}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="results-card">
        <div className="card-header">
          <div>
            <h4>Analyse-Ergebnisse</h4>
            <p className="meta">
              Kompakte Hinweise pro Experiment, inkl. Textstelle und Herkunftsspalte. Keine
              Bewertungen, nur Evidenz.
            </p>
          </div>
          <span className="pill soft">{filteredResults.length} Ergebnisse</span>
        </div>
        <div className="card-body">
          {filteredResults.length === 0 ? (
            <p className="hint">Starte die LLM-Analyse, um Auffälligkeiten zu sehen.</p>
          ) : (
            <ul className="deviation-list">
              {filteredResults.map((item) => (
                <li key={item.experimentId} className="deviation-row">
                  <div className="deviation-row-head">
                    <div>
                      <h5>{item.experimentName ?? item.experimentId}</h5>
                      <p className="meta">
                        Kommentare: {Object.keys(item.commentContext).join(", ") || "n/a"} ·
                        Parameter: {Object.keys(item.parameterEcho).join(", ") || "n/a"}
                      </p>
                    </div>
                    {renderObservationBadges(item.observations)}
                  </div>
                  {item.observations.length > 0 && (
                    <div className="observation-grid">
                      {item.observations.map((obs, index) => (
                        <div key={`${obs.category}-${index}`} className="observation-card">
                          <div className="observation-head">
                            <span className="badge emphasis">
                              {defaultBadgeForCategory[obs.category] ?? "⚠️"} {obs.category}
                            </span>
                            <span className="pill">Spalte: {obs.sourceColumns.join(", ")}</span>
                          </div>
                          <p className="hint">Textstelle: {obs.snippet}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
};
