import { useMemo } from "react";
import type { DeviationAnalysisState } from "../../types/analysisState";
import type { Experiment } from "../../types/experiment";
import type { ModelingOptions, ReactionNetworkState } from "../../types/modeling";
import { buildModelingPlan } from "../../lib/modeling/buildModelingPlan";

type ModelingScreenProps = {
  experiments: Experiment[];
  analysisState: DeviationAnalysisState;
  networkState: ReactionNetworkState;
  options: ModelingOptions;
  onOptionsChange: (next: ModelingOptions) => void;
  onBack: () => void;
  onContinue: () => void;
};

export const ModelingScreen = ({
  experiments,
  analysisState,
  networkState,
  options,
  onOptionsChange,
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
            className="btn btn-primary"
            disabled={!networkState.confirmed || modelingPlan.reactions.length === 0}
            onClick={onContinue}
          >
            Fit vorbereiten
          </button>
        </div>
      </div>
    </div>
  );
};
