import { useMemo } from "react";
import type { DeviationAnalysisState } from "../../types/analysisState";
import type { Experiment } from "../../types/experiment";
import type {
  ModelingOptions,
  ModelingRun,
  ReactionNetworkState
} from "../../types/modeling";
import { buildModelingPlan } from "../../lib/modeling/buildModelingPlan";
import {
  generateModelCandidates,
  validateModelingInputs
} from "../../lib/modeling/modelingScripts";

type ModelingScreenProps = {
  experiments: Experiment[];
  analysisState: DeviationAnalysisState;
  networkState: ReactionNetworkState;
  options: ModelingOptions;
  modelingRun: ModelingRun | null;
  onOptionsChange: (next: ModelingOptions) => void;
  onRunModeling: () => void;
  onBack: () => void;
  onContinue: () => void;
};

export const ModelingScreen = ({
  experiments,
  analysisState,
  networkState,
  options,
  modelingRun,
  onOptionsChange,
  onRunModeling,
  onBack,
  onContinue
}: ModelingScreenProps) => {
  const selectedExperiments = useMemo(() => {
    return experiments.filter(
      (experiment) => analysisState.fitSelection[experiment.experimentId] ?? true
    );
  }, [analysisState.fitSelection, experiments]);

  const selectedSeries = useMemo(() => {
    const map = new Map<string, { name: string; totalPoints: number; experimentCount: number }>();
    selectedExperiments.forEach((experiment) => {
      experiment.series.forEach((series) => {
        const entry = map.get(series.name) ?? {
          name: series.name,
          totalPoints: 0,
          experimentCount: 0
        };
        entry.totalPoints += series.time.length;
        entry.experimentCount += 1;
        map.set(series.name, entry);
      });
    });
    return Array.from(map.values());
  }, [selectedExperiments]);

  const totalPoints = useMemo(() => {
    return selectedExperiments.reduce((sum, experiment) => {
      return (
        sum +
        experiment.series.reduce((seriesSum, series) => seriesSum + series.time.length, 0)
      );
    }, 0);
  }, [selectedExperiments]);

  const recommendationCounts = useMemo(() => {
    return selectedExperiments.reduce(
      (acc, experiment) => {
        const recommendation =
          analysisState.representativityResults[experiment.experimentId]?.fitRecommendation ??
          "review";
        acc[recommendation] += 1;
        return acc;
      },
      { good: 0, review: 0, caution: 0 } as Record<
        "good" | "review" | "caution",
        number
      >
    );
  }, [analysisState.representativityResults, selectedExperiments]);

  const modelingPlan = useMemo(
    () => buildModelingPlan(networkState, options),
    [networkState, options]
  );
  const preflightPreview = useMemo(
    () =>
      validateModelingInputs({
        experiments,
        analysisState,
        networkState
      }).preflight,
    [analysisState, experiments, networkState]
  );
  const candidatePreview = useMemo(
    () => generateModelCandidates({ networkState, options }).candidates,
    [networkState, options]
  );

  const topVariants = useMemo(() => {
    if (!modelingRun) return [];
    const lookup = new Map(modelingRun.variants.map((variant) => [variant.id, variant]));
    return modelingRun.topVariantIds
      .map((id) => lookup.get(id))
      .filter((variant): variant is NonNullable<typeof variant> => Boolean(variant));
  }, [modelingRun]);

  const renderChart = (points: ModelingRun["variants"][number]["chart"]) => {
    if (points.length === 0) return null;
    const width = 240;
    const height = 120;
    const padding = 12;
    const xs = points.map((point) => point.x);
    const ys = points.flatMap((point) => [point.y, point.yFit]);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const scaleX = (value: number) =>
      padding + ((value - minX) / (maxX - minX || 1)) * (width - padding * 2);
    const scaleY = (value: number) =>
      height - padding - ((value - minY) / (maxY - minY || 1)) * (height - padding * 2);
    const buildPath = (key: "y" | "yFit") =>
      points
        .map((point, index) => {
          const x = scaleX(point.x);
          const y = scaleY(point[key]);
          return `${index === 0 ? "M" : "L"}${x},${y}`;
        })
        .join(" ");

    return (
      <svg className="modeling-chart" viewBox={`0 0 ${width} ${height}`} role="img">
        <path className="chart-line" d={buildPath("y")} />
        <path className="chart-line fit" d={buildPath("yFit")} />
      </svg>
    );
  };

  return (
    <div className="modeling-screen" aria-labelledby="modeling-fit-heading">
      <div className="section-intro">
        <p className="eyebrow">Schritt 5 · Modeling</p>
        <h2 id="modeling-fit-heading">Modell aufsetzen und Fit starten</h2>
        <p className="muted">
          Auf Basis des bestätigten Reaktionsnetzwerks definierst du jetzt die Modellannahmen.
          Nebenpfade, Katalysator-Deaktivierung und Restpfade lassen sich hier gezielt abbilden.
        </p>
      </div>

      <div className="card modeling-data-card">
        <div className="card-header">
          <div>
            <p className="eyebrow">Datenbasis aus Schritt 3</p>
            <h3>Ausgewählte Experimente für den Fit</h3>
            <p className="muted">
              Die Fit-Vormerkungen und LLM-Ergebnisse bleiben erhalten. Das Modeling nutzt die
              bestätigten Experimente und das definierte Netzwerk.
            </p>
          </div>
        </div>
        <div className="card-body">
          {selectedExperiments.length === 0 ? (
            <p className="muted">
              Aktuell ist kein Experiment für den Fit vorgemerkt. Gehe zurück und wähle mindestens
              einen Lauf aus.
            </p>
          ) : (
            <>
              <div className="modeling-data-summary">
                <div className="summary-pill">
                  <span className="label">Experimente</span>
                  <strong>{selectedExperiments.length}</strong>
                </div>
                <div className="summary-pill">
                  <span className="label">Messreihen</span>
                  <strong>{selectedSeries.length}</strong>
                </div>
                <div className="summary-pill">
                  <span className="label">Datenpunkte</span>
                  <strong>{totalPoints}</strong>
                </div>
                <div className="summary-pill good">
                  <span className="label">Fit empfohlen</span>
                  <strong>{recommendationCounts.good}</strong>
                </div>
                <div className="summary-pill warning">
                  <span className="label">Prüfen</span>
                  <strong>{recommendationCounts.review}</strong>
                </div>
                <div className="summary-pill danger">
                  <span className="label">Auffällig</span>
                  <strong>{recommendationCounts.caution}</strong>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="card modeling-card">
        <div className="card-header">
          <div>
            <p className="eyebrow">Preflight</p>
            <h3>Checkliste vor dem Fit</h3>
            <p className="muted">
              Prüfe die wichtigsten Grundlagen. Das LLM erklärt dir die Hinweise in Klartext.
            </p>
          </div>
          <span className="pill soft">
            {modelingRun?.preflight.summary ?? preflightPreview.summary}
          </span>
        </div>
        <div className="card-body">
          <div className="preflight-grid">
            {(modelingRun?.preflight.checks ?? preflightPreview.checks).map((check) => (
              <div key={check.id} className="preflight-row">
                <div>
                  <strong>{check.title}</strong>
                  <p className="muted">{check.detail}</p>
                  <p className="muted">Nächster Schritt: {check.nextStep}</p>
                </div>
                <span className={`status-pill ${check.status}`}>{check.status}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="modeling-grid">
        <div className="card modeling-card">
          <div className="card-header">
            <div>
              <p className="eyebrow">1 · Modellannahmen</p>
              <h3>Abweichungen und Deaktivierung berücksichtigen</h3>
              <p className="muted">
                Ergänze das Modell um Katalysator-Deaktivierung oder unbekannte Nebenpfade.
              </p>
            </div>
          </div>
          <div className="card-body">
            <div className="option-list">
              <label className="option-row">
                <input
                  type="checkbox"
                  checked={options.includeDeactivation}
                  onChange={(event) =>
                    onOptionsChange({
                      ...options,
                      includeDeactivation: event.target.checked
                    })
                  }
                />
                <div>
                  <strong>Katalysator-Deaktivierung berücksichtigen</strong>
                  <p className="muted">
                    Modelliert einen Aktivitätsabfall, falls der Katalysator über die Zeit nachlässt.
                  </p>
                </div>
              </label>
              {options.includeDeactivation && (
                <label className="role-select">
                  Deaktivierungsmodell
                  <select
                    value={options.deactivationModel}
                    onChange={(event) =>
                      onOptionsChange({
                        ...options,
                        deactivationModel: event.target.value as ModelingOptions["deactivationModel"]
                      })
                    }
                  >
                    <option value="first_order">1. Ordnung (Aktivitätsabfall)</option>
                    <option value="time_on_stream">Time-on-stream (zeitabhängig)</option>
                  </select>
                </label>
              )}
              <label className="option-row">
                <input
                  type="checkbox"
                  checked={options.includeUnknownSidePaths}
                  onChange={(event) =>
                    onOptionsChange({
                      ...options,
                      includeUnknownSidePaths: event.target.checked
                    })
                  }
                />
                <div>
                  <strong>Unbekannte Nebenpfade ergänzen</strong>
                  <p className="muted">
                    Fängt Restprodukte oder nicht identifizierte Nebenpfade mit einem Sammelpfad ab.
                  </p>
                </div>
              </label>
            </div>
          </div>
        </div>

        <div className="card modeling-card">
          <div className="card-header">
            <div>
              <p className="eyebrow">2 · Modellkandidaten</p>
              <h3>Plausible Ansatzfamilien</h3>
              <p className="muted">
                Der Agent schlägt erklärbare Kandidaten vor. Das LLM liefert Kurzinfos für
                Nicht‑Expert:innen.
              </p>
            </div>
          </div>
          <div className="card-body">
            <div className="candidate-list">
              {(modelingRun?.candidates ?? candidatePreview).map((candidate) => (
                <div key={candidate.id} className="candidate-row">
                  <div>
                    <strong>{candidate.label}</strong>
                    <p className="muted">{candidate.rationale}</p>
                    <p className="muted">LLM‑Hinweis: {candidate.llmSummary}</p>
                  </div>
                  <div className="candidate-meta">
                    <span className="pill">{candidate.family}</span>
                    <span className="pill soft">{candidate.parameterCount} Parameter</span>
                    {candidate.recommended && <span className="pill">Empfohlen</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="card modeling-card">
          <div className="card-header align-center">
            <div>
              <p className="eyebrow">3 · Modellstruktur</p>
              <h3>Reaktionsliste für den Fit</h3>
              <p className="muted">
                Das Modeling erzeugt aus dem Netzwerk eine Reaktionsliste inklusive Nebenpfaden.
              </p>
            </div>
          </div>
          <div className="card-body">
            {modelingPlan.reactions.length === 0 ? (
              <p className="muted">Noch keine Reaktionen definiert. Bitte Netzwerk ergänzen.</p>
            ) : (
              <div className="plan-list">
                {modelingPlan.reactions.map((reaction) => (
                  <div key={reaction.id} className="plan-row">
                    <div className="plan-main">
                      <strong>
                        {reaction.source} → {reaction.target}
                      </strong>
                      <span className="muted">{reaction.type}</span>
                    </div>
                    <div className="muted">{reaction.rateLaw}</div>
                    <p className="muted">{reaction.description}</p>
                  </div>
                ))}
              </div>
            )}
            {modelingPlan.notes.length > 0 && (
              <div className="hint-card">
                <h4>Modeling-Hinweise</h4>
                <ul>
                  {modelingPlan.notes.map((note) => (
                    <li key={note}>{note}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="card modeling-card modeling-results">
        <div className="card-header">
          <div>
            <p className="eyebrow">4 · Modeling durchführen</p>
            <h3>Varianten vergleichen und Ergebnisse einsehen</h3>
            <p className="muted">
              Nach dem Start werden alle Varianten durchgerechnet. Die besten Alternativen
              erscheinen mit Gleichungen, Diagrammen und Qualitätskennzahlen.
            </p>
          </div>
          {modelingRun && (
            <span className="pill soft">
              Berechnet · {new Date(modelingRun.requestedAt).toLocaleTimeString("de-DE")}
            </span>
          )}
        </div>
        <div className="card-body">
          {!modelingRun ? (
            <p className="muted">
              Das Modeling ist noch nicht gestartet. Starte den Lauf, um alle Varianten zu prüfen.
            </p>
          ) : (
            <div className="modeling-results-grid">
              <div className="modeling-results-summary">
                <div className="summary-pill">
                  <span className="label">Varianten</span>
                  <strong>{modelingRun.summary.variantCount}</strong>
                </div>
                <div className="summary-pill">
                  <span className="label">Experimente</span>
                  <strong>{modelingRun.summary.experimentCount}</strong>
                </div>
                <div className="summary-pill">
                  <span className="label">Messreihen</span>
                  <strong>{modelingRun.summary.seriesCount}</strong>
                </div>
                <div className="summary-pill">
                  <span className="label">Datenpunkte</span>
                  <strong>{modelingRun.summary.pointCount}</strong>
                </div>
              </div>

              <div className="modeling-top-variants">
                {topVariants.map((variant, index) => (
                  <div key={variant.id} className="modeling-variant-card">
                    <div className="variant-header">
                      <div>
                        <p className="eyebrow">
                          {index === 0 ? "Beste Passung" : `Alternative ${index + 1}`}
                        </p>
                        <h4>{variant.label}</h4>
                        <p className="muted">
                          {variant.parameters} Parameter · {variant.plan.reactions.length} Reaktionen
                        </p>
                      </div>
                      {variant.isSelected && <span className="pill">User-Variante</span>}
                    </div>
                    <div className="variant-metrics">
                      <div>
                        <span className="label">R²</span>
                        <strong>{variant.metrics.r2.toFixed(3)}</strong>
                      </div>
                      <div>
                        <span className="label">RMSE</span>
                        <strong>{variant.metrics.rmse.toFixed(3)}</strong>
                      </div>
                      <div>
                        <span className="label">AIC</span>
                        <strong>{variant.metrics.aic.toFixed(2)}</strong>
                      </div>
                      <div>
                        <span className="label">BIC</span>
                        <strong>{variant.metrics.bic.toFixed(2)}</strong>
                      </div>
                    </div>
                    <div className="variant-content">
                      <div className="variant-equations">
                        <h5>Gleichungen</h5>
                        <ul>
                          {variant.equations.map((equation) => (
                            <li key={equation}>
                              <code>{equation}</code>
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div className="variant-chart">
                        <h5>Diagramm</h5>
                        {renderChart(variant.chart)}
                        <p className="muted">Messpunkte (dunkel) vs. Fit (blau).</p>
                      </div>
                    </div>
                    <div className="variant-notes">
                      <h5>Annahmen</h5>
                      <ul>
                        {variant.assumptions.map((assumption) => (
                          <li key={assumption}>{assumption}</li>
                        ))}
                      </ul>
                    </div>
                    <div className="variant-parameters">
                      <h5>Parameter</h5>
                      <div className="parameter-list">
                        {variant.parametersDetail.map((parameter) => (
                          <div key={parameter.name} className="parameter-row">
                            <strong>{parameter.name}</strong>
                            <span>
                              {parameter.value} {parameter.unit}
                            </span>
                            <span className="muted">
                              [{parameter.min} – {parameter.max}]
                            </span>
                            <span className={`status-pill ${parameter.status}`}>
                              {parameter.status}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="variant-diagnostics">
                      <h5>Diagnostik</h5>
                      <p className="muted">{variant.diagnostics.residualPattern}</p>
                      {variant.diagnostics.warnings.length > 0 && (
                        <ul>
                          {variant.diagnostics.warnings.map((warning) => (
                            <li key={warning}>{warning}</li>
                          ))}
                        </ul>
                      )}
                      <p className="muted">Empfehlung: {variant.diagnostics.recommendation}</p>
                      <p className="muted">LLM‑Hinweis: {variant.diagnostics.llmSummary}</p>
                    </div>
                  </div>
                ))}
              </div>

              {modelingRun?.llmGuidance && (
                <div className="hint-card">
                  <h4>LLM‑Navigation (Erklärtexte)</h4>
                  <ul>
                    {modelingRun.llmGuidance.map((note) => (
                      <li key={note}>{note}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="hint-card">
                <h4>Transparenz: Was wurde gerechnet?</h4>
                <ul>
                  {modelingRun.log.map((entry) => (
                    <li key={entry}>{entry}</li>
                  ))}
                </ul>
              </div>

              <div className="hint-card">
                <h4>Audit-Log: Skriptläufe</h4>
                <ul>
                  {modelingRun.auditTrail.map((entry) => (
                    <li key={`${entry.scriptName}-${entry.ranAt}`}>
                      {entry.scriptName} · {entry.version} · {entry.inputSummary} →{" "}
                      {entry.outputSummary}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="modeling-variant-list">
                <h4>Alle berechneten Varianten</h4>
                <div className="variant-list">
                  {modelingRun.variants.map((variant) => (
                    <div key={variant.id} className="variant-row">
                      <div>
                        <p className="variant-title">{variant.label}</p>
                        <p className="muted">
                          {variant.parameters} Parameter · {variant.pointCount} Punkte ·{" "}
                          {variant.plan.reactions.length} Reaktionen
                        </p>
                      </div>
                      <div className="variant-metrics-inline">
                        <span>R² {variant.metrics.r2.toFixed(3)}</span>
                        <span>AIC {variant.metrics.aic.toFixed(2)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="modeling-footer">
        <div className="modeling-guidance">
          <h4>Fit-Check</h4>
          <p className="muted">
            Stelle sicher, dass das Netzwerk bestätigt ist und die Modellannahmen zu den
            Experimenten passen, bevor du den Fit startest.
          </p>
        </div>
        <div className="action-row">
          <button type="button" className="btn btn-ghost" onClick={onBack}>
            Zurück zum Netzwerk
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={
              !networkState.confirmed ||
              modelingPlan.reactions.length === 0 ||
              selectedExperiments.length === 0
            }
            onClick={onRunModeling}
          >
            Modeling starten
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!modelingRun}
            onClick={onContinue}
          >
            Weiter zum Report
          </button>
        </div>
      </div>
    </div>
  );
};
