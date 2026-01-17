import { useEffect, useMemo, useState } from "react";
import {
  buildModelingPlan,
  buildModelingScenarios
} from "../../lib/modeling/modeling";
import type { DeviationAnalysisState } from "../../types/analysisState";
import type { Experiment } from "../../types/experiment";
import type { ModelingPlan, ReactionNetwork } from "../../types/modeling";

type ModelingScreenProps = {
  experiments: Experiment[];
  analysisState: DeviationAnalysisState;
  network: ReactionNetwork;
  onBack: () => void;
  onConfirm: (plan: ModelingPlan) => void;
};

export const ModelingScreen = ({
  experiments,
  analysisState,
  network,
  onBack,
  onConfirm
}: ModelingScreenProps) => {
  const selectedExperiments = useMemo(() => {
    return experiments.filter(
      (experiment) => analysisState.fitSelection[experiment.experimentId] ?? true
    );
  }, [analysisState.fitSelection, experiments]);

  const scenarios = useMemo(() => {
    return buildModelingScenarios(selectedExperiments, network);
  }, [network, selectedExperiments]);

  const [selectedScenarioId, setSelectedScenarioId] = useState(() => {
    return scenarios.find((scenario) => scenario.recommended)?.id ?? scenarios[0]?.id ?? "";
  });

  useEffect(() => {
    if (!scenarios.find((scenario) => scenario.id === selectedScenarioId)) {
      setSelectedScenarioId(
        scenarios.find((scenario) => scenario.recommended)?.id ?? scenarios[0]?.id ?? ""
      );
    }
  }, [scenarios, selectedScenarioId]);

  const selectedScenario = useMemo(() => {
    return scenarios.find((scenario) => scenario.id === selectedScenarioId) ?? scenarios[0];
  }, [scenarios, selectedScenarioId]);

  const modelingPlan = useMemo(() => {
    if (!selectedScenario) return null;
    return buildModelingPlan(network, selectedScenario);
  }, [network, selectedScenario]);

  return (
    <div className="modeling-fit-screen" aria-labelledby="modeling-fit-heading">
      <div className="section-intro">
        <p className="eyebrow">Schritt 5 · Modeling</p>
        <h2 id="modeling-fit-heading">Modeling vorbereiten</h2>
        <p className="muted">
          Wähle, wie der Fit mit Sonderfällen umgehen soll – etwa Kat-Deaktivierung oder
          unbekannte Nebenpfade. Die Auswahl erzeugt einen konkreten Modellierungsplan.
        </p>
      </div>

      <div className="modeling-fit-grid">
        <div className="card modeling-fit-card">
          <div className="card-header">
            <div>
              <p className="eyebrow">1 · Szenario wählen</p>
              <h3>Wie soll der Fit auf Sonderfälle reagieren?</h3>
              <p className="muted">
                Du kannst mehrere Modelle vergleichen, starte aber mit einem klaren Szenario.
              </p>
            </div>
          </div>
          <div className="card-body">
            <div className="scenario-list">
              {scenarios.map((scenario) => (
                <label key={scenario.id} className="scenario-option">
                  <input
                    type="radio"
                    name="modeling-scenario"
                    value={scenario.id}
                    checked={selectedScenarioId === scenario.id}
                    onChange={() => setSelectedScenarioId(scenario.id)}
                  />
                  <div className="scenario-copy">
                    <div className="scenario-headline">
                      <strong>{scenario.label}</strong>
                      {scenario.recommended && (
                        <span className="pill pill-recommended">Empfohlen</span>
                      )}
                    </div>
                    <p className="muted">{scenario.description}</p>
                    <ul>
                      {scenario.assumptions.map((assumption) => (
                        <li key={assumption}>{assumption}</li>
                      ))}
                    </ul>
                  </div>
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="card modeling-fit-card">
          <div className="card-header">
            <div>
              <p className="eyebrow">2 · Fit-Plan</p>
              <h3>Das Modell wird so vorbereitet</h3>
              <p className="muted">
                Der Plan basiert auf dem Reaktionsnetzwerk und der gewählten Strategie.
              </p>
            </div>
          </div>
          <div className="card-body">
            {modelingPlan ? (
              <div className="plan-stack">
                <div className="plan-row">
                  <span className="label">Netzwerk</span>
                  <strong>{modelingPlan.networkSummary}</strong>
                </div>
                <div className="plan-row">
                  <span className="label">Parameter</span>
                  <div className="chip-row">
                    {modelingPlan.parameters.map((param) => (
                      <span key={param} className="chip">
                        {param}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="plan-row">
                  <span className="label">Annahmen</span>
                  <ul>
                    {modelingPlan.assumptions.map((assumption) => (
                      <li key={assumption}>{assumption}</li>
                    ))}
                  </ul>
                </div>
                {modelingPlan.warnings.length > 0 && (
                  <div className="plan-warning">
                    <h4>Hinweise</h4>
                    <ul>
                      {modelingPlan.warnings.map((warning) => (
                        <li key={warning}>{warning}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ) : (
              <p className="muted">Kein Szenario ausgewählt.</p>
            )}
          </div>
        </div>
      </div>

      <div className="modeling-footer">
        <div className="modeling-guidance">
          <h4>Nächster Schritt</h4>
          <p className="muted">
            Sobald der Plan bestätigt ist, können wir den Fit starten und Diagnosen wie R²,
            Parameterkorrelationen und Konfidenzintervalle ausgeben.
          </p>
        </div>
        <div className="action-row">
          <button type="button" className="btn btn-ghost" onClick={onBack}>
            Zurück zum Netzwerk
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!modelingPlan}
            onClick={() => {
              if (modelingPlan) {
                onConfirm(modelingPlan);
              }
            }}
          >
            Fit vorbereiten
          </button>
        </div>
      </div>
    </div>
  );
};
