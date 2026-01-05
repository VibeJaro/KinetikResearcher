import { useEffect, useMemo, useState } from "react";
import type { Experiment } from "../../types/experiment";
import type { DeviationFinding } from "../../types/deviations";
import { deviationOntology } from "../../types/deviations";
import { analyzeExperimentForDeviations } from "../../lib/deviations/analyzeExperiment";

const iconMap: Record<string, string> = {
  "Apparatur- oder Anlagenprobleme": "⚙️",
  "Abweichender Dosier- oder Zugabemodus": "💧",
  "Temperatur- oder Druckinstabilität": "🌡️",
  "Geänderte Reihenfolge oder veränderter Ablauf": "🔄",
  "Probleme mit Materialqualität oder Verunreinigungen": "🧪",
  "Unerwartete Ereignisse oder Zwischenfälle": "❗",
  "Explizite Warnungen oder Einschränkungen": "⚠️",
  "Geänderter Aufarbeitungs- oder Isolationsschritt": "🧰",
  "Probleme bei Analytik oder Probenahme": "📈",
  "Explizite Angabe zentraler Versuchsparameter im Kommentar": "🧾"
};

type DeviationScreenProps = {
  experiments: Experiment[];
  columnOptions: string[];
  selection: {
    commentColumns: string[];
    parameterColumns: string[];
  };
  onSelectionChange: (selection: { commentColumns: string[]; parameterColumns: string[] }) => void;
  findings: Record<string, DeviationFinding[]>;
  status: "idle" | "running" | "done";
  onRunAnalysis: (selection: { commentColumns: string[]; parameterColumns: string[] }) => void;
};

type Filter = "all" | "clean" | "dosage";

type ExperimentWithFindings = {
  experiment: Experiment;
  findings: DeviationFinding[];
};

const formatParameterSnapshot = (experiment: Experiment, parameterColumns: string[]): string[] => {
  const chips: string[] = [];
  parameterColumns.forEach((column) => {
    const values = experiment.columnValues?.[column] ?? [];
    if (values.length > 0) {
      chips.push(`${column}: ${values.slice(0, 2).join(" · ")}${values.length > 2 ? " …" : ""}`);
    }
  });
  return chips;
};

export const DeviationScreen = ({
  experiments,
  columnOptions,
  selection,
  onSelectionChange,
  findings,
  status,
  onRunAnalysis
}: DeviationScreenProps) => {
  const [filter, setFilter] = useState<Filter>("all");

  useEffect(() => {
    setFilter("all");
  }, [experiments]);

  const displayExperiments: ExperimentWithFindings[] = useMemo(() => {
    const items = experiments.map((experiment) => ({
      experiment,
      findings: findings[experiment.experimentId] ?? []
    }));

    if (filter === "clean") {
      return items.filter((item) => item.findings.length === 0);
    }
    if (filter === "dosage") {
      return items.filter((item) =>
        item.findings.some((finding) => finding.category === "Abweichender Dosier- oder Zugabemodus")
      );
    }
    return items;
  }, [experiments, findings, filter]);

  const handleToggle = (column: string, target: "commentColumns" | "parameterColumns") => {
    const current = selection[target];
    const next = current.includes(column)
      ? current.filter((value) => value !== column)
      : [...current, column];
    onSelectionChange({ ...selection, [target]: next });
  };

  const handleRun = () => {
    onRunAnalysis(selection);
  };

  const progress = useMemo(() => {
    const completed = Object.keys(findings).length;
    if (experiments.length === 0) return 0;
    return Math.min(100, Math.round((completed / experiments.length) * 100));
  }, [findings, experiments.length]);

  return (
    <section className="deviation-screen">
      <header className="section-intro">
        <p className="eyebrow">Schritt 3 · Abweichungen (LLM)</p>
        <h2>Kommentarspalten prüfen und Auffälligkeiten markieren</h2>
        <p className="muted">
          Wähle zuerst die Kommentarspalten mit möglichen Abweichungen und die Kerndaten-Spalten
          (Parameter, Bedingungen). Pro Experiment wird dann ein LLM-Aufruf ausgeführt, der nur die
          definierte Ontologie nutzt. Ergebnisse erscheinen experimentweise als kompakte Hinweise
          ohne Wertung.
        </p>
      </header>

      <div className="deviation-layout">
        <div className="selection-panel card">
          <div className="card-header">
            <div>
              <p className="eyebrow">Quellen</p>
              <h3>Spaltenauswahl</h3>
              <p className="meta">
                Kommentarspalten werden auf Abweichungen geprüft, Parameter-Spalten werden als Kontext
                eingeblendet.
              </p>
            </div>
            <div className="chip-row">
              <span className="pill soft">{experiments.length} Experimente</span>
              <span className="pill">{columnOptions.length} verfügbare Spalten</span>
            </div>
          </div>
          <div className="card-body selection-grid">
            <div>
              <div className="selection-header">
                <h4>Kommentarspalten</h4>
                <p className="meta">Mindestens eine auswählen.</p>
              </div>
              {columnOptions.length === 0 ? (
                <p className="muted">Keine optionalen Spalten erkannt. Mapping abschließen, um mehr Auswahl zu bekommen.</p>
              ) : (
                <div className="checkbox-grid">
                  {columnOptions.map((column) => (
                    <label key={`comment-${column}`} className="checkbox-row">
                      <input
                        type="checkbox"
                        checked={selection.commentColumns.includes(column)}
                        onChange={() => handleToggle(column, "commentColumns")}
                        disabled={status === "running"}
                      />
                      <span>{column}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
            <div>
              <div className="selection-header">
                <h4>Parameter-/Bedingungsspalten</h4>
                <p className="meta">Optional, wird als Kontext angezeigt.</p>
              </div>
              {columnOptions.length === 0 ? (
                <p className="muted">Sobald Spalten vorhanden sind, kannst du hier Kontext für die Anzeige wählen.</p>
              ) : (
                <div className="checkbox-grid">
                  {columnOptions.map((column) => (
                    <label key={`parameter-${column}`} className="checkbox-row">
                      <input
                        type="checkbox"
                        checked={selection.parameterColumns.includes(column)}
                        onChange={() => handleToggle(column, "parameterColumns")}
                        disabled={status === "running"}
                      />
                      <span>{column}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="card-footer deviation-actions">
            <div>
              <p className="meta">
                Ontologie mit 10 Kategorien · keine freien Labels · ein Aufruf pro Experiment für klare
                Nachvollziehbarkeit.
              </p>
              {status !== "idle" && (
                <p className="meta">Fortschritt: {progress}% ({Object.keys(findings).length}/{experiments.length})</p>
              )}
            </div>
            <div className="action-row">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setFilter("all")}
                disabled={experiments.length === 0}
              >
                Alle zeigen
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setFilter("clean")}
                disabled={experiments.length === 0}
              >
                Nur Versuche ohne Auffälligkeiten
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setFilter("dosage")}
                disabled={experiments.length === 0}
              >
                Zeig mir alle mit Dosierabweichung
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleRun}
                disabled={selection.commentColumns.length === 0 || status === "running" || experiments.length === 0}
              >
                {status === "running" ? "LLM prüft…" : "LLM-Scan starten"}
              </button>
            </div>
          </div>
        </div>

        <div className="ontology card">
          <div className="card-header">
            <div>
              <p className="eyebrow">Leitplanken</p>
              <h3>Erlaubte Kategorien</h3>
            </div>
          </div>
          <div className="card-body ontology-list">
            {deviationOntology.map((item) => (
              <div key={item.key} className="ontology-row">
                <div className="chip">
                  {iconMap[item.key] ?? "🔎"} {item.key}
                </div>
                <p className="meta">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="results-grid">
        {displayExperiments.length === 0 ? (
          <div className="placeholder-card">
            <h3>Keine Experimente geladen</h3>
            <p className="muted">Importiere und valide Daten, um die Abweichungsanalyse zu starten.</p>
          </div>
        ) : (
          displayExperiments.map(({ experiment, findings: experimentFindings }) => {
            const parameterSnapshot = formatParameterSnapshot(experiment, selection.parameterColumns);
            const statusBadge =
              experimentFindings.length === 0 ? (
                <span className="badge clean">Keine Auffälligkeiten</span>
              ) : (
                <span className="badge warning">{experimentFindings.length} Auffälligkeit(en)</span>
              );
            return (
              <article key={experiment.experimentId} className="experiment-card deviation-card">
                <header>
                  <div>
                    <h4>{experiment.name ?? "Experiment ohne Namen"}</h4>
                    <p className="meta">{experiment.series.length} Reihen · ID {experiment.experimentId}</p>
                  </div>
                  {statusBadge}
                </header>
                {parameterSnapshot.length > 0 && (
                  <div className="chip-row">
                    {parameterSnapshot.map((item) => (
                      <span key={item} className="chip">
                        {item}
                      </span>
                    ))}
                  </div>
                )}
                {experimentFindings.length === 0 ? (
                  <p className="muted">Keine Hinweise auf Abweichungen in den gewählten Kommentarspalten.</p>
                ) : (
                  <ul className="finding-list">
                    {experimentFindings.map((finding, index) => (
                      <li key={`${experiment.experimentId}-${index}`}>
                        <div className="finding-header">
                          <span className="chip soft">{iconMap[finding.category] ?? "🔎"} {finding.category}</span>
                          <span className="meta">Quelle: {finding.sourceColumn}</span>
                        </div>
                        <p className="finding-snippet">“{finding.snippet}”</p>
                      </li>
                    ))}
                  </ul>
                )}
              </article>
            );
          })
        )}
      </div>
    </section>
  );
};
