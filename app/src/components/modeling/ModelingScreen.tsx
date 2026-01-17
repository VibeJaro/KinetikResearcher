import { useMemo } from "react";
import type { DeviationAnalysisState } from "../../types/analysisState";
import type { Experiment } from "../../types/experiment";
import type {
  ModelingOptions,
  ModelingRun,
  ModelingVariant,
  ReactionNetworkState
} from "../../types/modeling";
import { buildModelingPlan } from "../../lib/modeling/buildModelingPlan";

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

  const variantCount = modelingRun?.variants.length ?? 0;

  const formatScore = (value: number) => value.toFixed(3);
  const formatMetric = (value: number) => value.toFixed(2);

  const ModelingVariantChart = ({ variant }: { variant: ModelingVariant }) => {
    const viewWidth = 320;
    const viewHeight = 140;
    const padding = 16;
    const points = variant.chart.time.map((t, index) => ({
      x: t,
      observed: variant.chart.observed[index],
      predicted: variant.chart.predicted[index]
    }));
    const validPoints = points.filter(
      (point) => Number.isFinite(point.x) && Number.isFinite(point.observed)
    );

    if (validPoints.length === 0) {
      return <p className="muted">Keine numerischen Daten für die Vorschau.</p>;
    }

    const xMin = Math.min(...validPoints.map((p) => p.x));
    const xMax = Math.max(...validPoints.map((p) => p.x));
    const yValues = validPoints.flatMap((p) => [p.observed, p.predicted]);
    const yMin = Math.min(...yValues);
    const yMax = Math.max(...yValues);
    const xRange = xMax - xMin || 1;
    const yRange = yMax - yMin || 1;

    const toSvgX = (x: number) =>
      padding + ((x - xMin) / xRange) * (viewWidth - padding * 2);
    const toSvgY = (y: number) =>
      viewHeight - padding - ((y - yMin) / yRange) * (viewHeight - padding * 2);

    const observedPath = validPoints
      .map((point, index) => `${index === 0 ? "M" : "L"} ${toSvgX(point.x)} ${toSvgY(point.observed)}`)
      .join(" ");
    const predictedPath = validPoints
      .map((point, index) => `${index === 0 ? "M" : "L"} ${toSvgX(point.x)} ${toSvgY(point.predicted)}`)
      .join(" ");

    return (
      <svg
        className="modeling-chart"
        viewBox={`0 0 ${viewWidth} ${viewHeight}`}
        role="img"
        aria-label={`Diagramm für ${variant.name}`}
      >
        <path d={observedPath} fill="none" stroke="#0f172a" strokeWidth="2" />
        <path d={predictedPath} fill="none" stroke="#38bdf8" strokeWidth="2" strokeDasharray="6 4" />
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
          <div className="card-header align-center">
            <div>
              <p className="eyebrow">2 · Modellstruktur</p>
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

      {!modelingRun && (
        <div className="card modeling-card modeling-run-card">
          <div className="card-header">
            <div>
              <p className="eyebrow">3 · Modeling starten</p>
              <h3>Alle Varianten durchrechnen</h3>
              <p className="muted">
                Sobald du startest, werden alle Modellvarianten mit den gewählten Annahmen
                berechnet. Die besten Alternativen erscheinen direkt mit Gleichungen und Diagrammen.
              </p>
            </div>
          </div>
          <div className="card-body">
            <div className="inline-callout">
              <strong>Transparenz:</strong> Wir zeigen dir jede Variante, ihre Metriken und die
              verwendeten Gleichungen. Keine versteckten Schritte.
            </div>
          </div>
        </div>
      )}

      {modelingRun && (
        <div className="modeling-results">
          <div className="card modeling-card">
            <div className="card-header align-center">
              <div>
                <p className="eyebrow">Ergebnis · Top-Varianten</p>
                <h3>Beste Alternativen aus {variantCount} Varianten</h3>
                <p className="muted">
                  Die Varianten sind nach R² sortiert. Wähle die beste Basis für den Report.
                </p>
              </div>
            </div>
            <div className="card-body">
              <div className="variant-grid">
                {modelingRun.bestVariants.map((variant) => (
                  <div key={variant.id} className="variant-card">
                    <div className="variant-header">
                      <div>
                        <strong>{variant.name}</strong>
                        <p className="muted">Gewichtung: {variant.weighting}</p>
                      </div>
                      <div className="variant-metrics">
                        <span>R² {formatScore(variant.score.r2)}</span>
                        <span>RMSE {formatScore(variant.score.rmse)}</span>
                      </div>
                    </div>
                    <ModelingVariantChart variant={variant} />
                    <div className="variant-equations">
                      <h4>Gleichungen</h4>
                      <ul>
                        {variant.equations.map((equation) => (
                          <li key={equation}>{equation}</li>
                        ))}
                      </ul>
                    </div>
                    <div className="variant-assumptions">
                      <h4>Annahmen</h4>
                      <ul>
                        {variant.assumptions.map((assumption) => (
                          <li key={assumption}>{assumption}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="card modeling-card">
            <div className="card-header">
              <div>
                <p className="eyebrow">Alle Varianten</p>
                <h3>Vollständige Übersicht der Berechnungen</h3>
                <p className="muted">
                  Jede Variante mit Metriken für Transparenz und Vergleichbarkeit.
                </p>
              </div>
            </div>
            <div className="card-body">
              <div className="variant-table">
                {modelingRun.variants.map((variant) => (
                  <div key={variant.id} className="variant-row">
                    <div>
                      <strong>{variant.name}</strong>
                      <p className="muted">
                        Gewichtung: {variant.weighting} · {variant.assumptions[0]}
                      </p>
                    </div>
                    <div className="variant-score-row">
                      <span>R² {formatScore(variant.score.r2)}</span>
                      <span>RMSE {formatScore(variant.score.rmse)}</span>
                      <span>AIC {formatMetric(variant.score.aic)}</span>
                      <span>BIC {formatMetric(variant.score.bic)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="card modeling-card">
            <div className="card-header">
              <div>
                <p className="eyebrow">Rechenlog</p>
                <h3>Was genau berechnet wurde</h3>
                <p className="muted">
                  Zusammenfassung der Eingaben, Reaktionen und Berechnungszeitpunkte.
                </p>
              </div>
            </div>
            <div className="card-body">
              <div className="calculation-grid">
                <div>
                  <h4>Berechnungsdetails</h4>
                  <ul>
                    <li>Start: {new Date(modelingRun.startedAt).toLocaleString("de-DE")}</li>
                    <li>Ende: {new Date(modelingRun.completedAt).toLocaleString("de-DE")}</li>
                    <li>Experimente: {modelingRun.experimentCount}</li>
                    <li>Messreihen: {modelingRun.seriesCount}</li>
                    <li>Datenpunkte: {modelingRun.pointCount}</li>
                    <li>Varianten: {modelingRun.variants.length}</li>
                  </ul>
                </div>
                <div>
                  <h4>Reaktionsliste</h4>
                  {modelingRun.reactions.length === 0 ? (
                    <p className="muted">Keine Reaktionen hinterlegt.</p>
                  ) : (
                    <ul>
                      {modelingRun.reactions.map((reaction) => (
                        <li key={reaction.id}>
                          {reaction.source} → {reaction.target} · {reaction.rateLaw}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div>
                  <h4>Modeling-Notizen</h4>
                  <ul>
                    {modelingRun.calculationNotes.map((note) => (
                      <li key={note}>{note}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

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
            Zum Report
          </button>
        </div>
      </div>
    </div>
  );
};
