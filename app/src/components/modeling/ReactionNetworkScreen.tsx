import { useEffect, useMemo } from "react";
import { buildReactionNetwork } from "../../lib/modeling/modeling";
import type { DeviationAnalysisState } from "../../types/analysisState";
import type { Experiment } from "../../types/experiment";
import type { NetworkEdge, ReactionNetwork, RoleKey } from "../../types/modeling";

const roleOptions: { value: RoleKey; label: string; hint: string }[] = [
  { value: "reactant", label: "Edukt", hint: "Startstoffe im Reaktionspfad." },
  { value: "product", label: "Produkt", hint: "Zielmolekül oder Hauptprodukt." },
  { value: "intermediate", label: "Zwischenprodukt", hint: "Kurzlebige Station im Pfad." },
  { value: "side", label: "Nebenprodukt", hint: "Abzweig oder unerwünschtes Produkt." }
];

type ReactionNetworkScreenProps = {
  experiments: Experiment[];
  analysisState: DeviationAnalysisState;
  network: ReactionNetwork;
  onNetworkChange: (next: ReactionNetwork) => void;
  onBack: () => void;
  onConfirm: () => void;
};

const areAssignmentsEqual = (
  nextAssignments: ReactionNetwork["assignments"],
  prevAssignments: ReactionNetwork["assignments"]
): boolean => {
  if (nextAssignments.length !== prevAssignments.length) return false;
  return nextAssignments.every(
    (item, index) =>
      item.column === prevAssignments[index]?.column &&
      item.role === prevAssignments[index]?.role
  );
};

const areEdgesEqual = (nextEdges: NetworkEdge[], prevEdges: NetworkEdge[]): boolean => {
  if (nextEdges.length !== prevEdges.length) return false;
  return nextEdges.every(
    (edge, index) =>
      edge.source === prevEdges[index]?.source &&
      edge.target === prevEdges[index]?.target &&
      edge.type === prevEdges[index]?.type
  );
};

export const ReactionNetworkScreen = ({
  experiments,
  analysisState,
  network,
  onNetworkChange,
  onBack,
  onConfirm
}: ReactionNetworkScreenProps) => {
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

  useEffect(() => {
    const seriesNames = selectedSeries.map((series) => series.name);
    const nextNetwork = buildReactionNetwork(seriesNames, network);
    const assignmentsEqual = areAssignmentsEqual(nextNetwork.assignments, network.assignments);
    const edgesEqual = areEdgesEqual(nextNetwork.edges, network.edges);
    if (!assignmentsEqual || !edgesEqual) {
      onNetworkChange(nextNetwork);
    }
  }, [network, onNetworkChange, selectedSeries]);

  const roleCounts = useMemo(() => {
    return roleOptions.map((role) => ({
      role: role.value,
      label: role.label,
      count: network.assignments.filter((item) => item.role === role.value).length
    }));
  }, [network.assignments]);

  const guidanceNotes = useMemo(() => {
    const notes: string[] = [];
    if (!network.assignments.some((item) => item.role === "product")) {
      notes.push("Noch kein Produkt markiert – bitte mindestens ein Produkt auswählen.");
    }
    if (!network.assignments.some((item) => item.role === "reactant")) {
      notes.push("Es fehlt ein Edukt. Mindestens ein Startstoff ist nötig.");
    }
    if (network.edges.length === 0) {
      notes.push("Lege mindestens einen Pfeil an, damit das Netzwerk modelliert werden kann.");
    }
    return notes;
  }, [network.assignments, network.edges]);

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

  const handleRoleChange = (id: string, nextRole: RoleKey) => {
    onNetworkChange({
      ...network,
      assignments: network.assignments.map((item) =>
        item.id === id ? { ...item, role: nextRole } : item
      ),
      confirmed: false
    });
  };

  const handleEdgeChange = (id: string, key: "source" | "target" | "type", value: string) => {
    onNetworkChange({
      ...network,
      edges: network.edges.map((edge) => (edge.id === id ? { ...edge, [key]: value } : edge)),
      confirmed: false
    });
  };

  const handleAddEdge = () => {
    const first = network.assignments[0]?.id;
    const second = network.assignments[1]?.id ?? first;
    if (!first || !second) return;
    onNetworkChange({
      ...network,
      edges: [
        ...network.edges,
        {
          id: `edge-${network.edges.length + 1}-${first}-${second}`,
          source: first,
          target: second,
          type: "Hauptpfad"
        }
      ],
      confirmed: false
    });
  };

  return (
    <div className="modeling-screen" aria-labelledby="modeling-heading">
      <div className="section-intro">
        <p className="eyebrow">Schritt 4 · Reaktionsnetzwerk</p>
        <h2 id="modeling-heading">Reaktionsnetzwerk definieren</h2>
        <p className="muted">
          Bevor das Modeling startet, ordnest du die gemessenen Spalten den Rollen zu und definierst
          den Pfad zwischen den Komponenten. So bleibt klar, wo Nebenprodukte oder Abzweige liegen.
        </p>
      </div>

      <div className="card modeling-data-card">
        <div className="card-header">
          <div>
            <p className="eyebrow">Datenbasis aus Schritt 3</p>
            <h3>Auswahl für das Modeling vorbereiten</h3>
            <p className="muted">
              Die Fit-Vormerkungen und LLM-Ergebnisse bleiben erhalten, wenn du zwischen den
              Schritten navigierst. Hier siehst du die reale Datenbasis für den Fit.
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

              <div className="experiment-list">
                {selectedExperiments.map((experiment) => {
                  const representativity =
                    analysisState.representativityResults[experiment.experimentId];
                  const recommendation =
                    representativity?.fitRecommendation ?? "review";
                  return (
                    <div key={experiment.experimentId} className="experiment-row">
                      <div>
                        <p className="experiment-name">{experiment.name ?? experiment.experimentId}</p>
                        <p className="meta">
                          {experiment.series.length} Reihen ·{" "}
                          {experiment.series.reduce(
                            (sum, series) => sum + series.time.length,
                            0
                          )}{" "}
                          Punkte
                        </p>
                      </div>
                      <span className={`recommendation-pill ${recommendation}`}>
                        {recommendation === "good"
                          ? "Gut geeignet"
                          : recommendation === "caution"
                            ? "Auffällig"
                            : "Prüfen"}
                      </span>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>

      <div className="modeling-grid">
        <div className="card modeling-card">
          <div className="card-header">
            <div>
              <p className="eyebrow">1 · Rollen zuweisen</p>
              <h3>Welche Spalte beschreibt welche Rolle?</h3>
              <p className="muted">
                Wähle pro Substanz, ob sie Edukt, Produkt, Zwischen- oder Nebenprodukt ist.
              </p>
            </div>
          </div>
          <div className="card-body">
              <div className="role-list">
              {network.assignments.length === 0 ? (
                <p className="muted">Keine Messreihen ausgewählt.</p>
              ) : (
                network.assignments.map((item) => (
                  <div key={item.id} className="role-row">
                    <div className="role-meta">
                      <span className="role-name">{item.name}</span>
                      <span className="muted">Spalte: {item.column}</span>
                    </div>
                    <label className="role-select">
                      Rolle
                      <select
                        value={item.role}
                        onChange={(event) =>
                          handleRoleChange(item.id, event.target.value as RoleKey)
                        }
                      >
                        {roleOptions.map((role) => (
                          <option key={role.value} value={role.value}>
                            {role.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                ))
              )}
            </div>
            <div className="modeling-summary">
              {roleCounts.map((role) => (
                <div key={role.role} className="summary-pill muted">
                  <span className="label">{role.label}</span>
                  <strong>{role.count} Spalten</strong>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="card modeling-card">
          <div className="card-header align-center">
            <div>
              <p className="eyebrow">2 · Netzwerk definieren</p>
              <h3>Wie hängen die Komponenten zusammen?</h3>
              <p className="muted">
                Verbinde Quellen und Ziele. Markiere Nebenpfade, damit spätere Fits Nebenprodukte
                und Abzweige korrekt behandeln.
              </p>
            </div>
            <button type="button" className="btn btn-ghost" onClick={handleAddEdge}>
              + Pfeil hinzufügen
            </button>
          </div>
            <div className="card-body">
              <div className="network-canvas">
                <div className="network-visual">
                  {network.assignments.map((item) => (
                    <span
                      key={item.id}
                      className={`node-pill ${item.role}`}
                      title={roleOptions.find((role) => role.value === item.role)?.hint}
                    >
                      {item.name}
                    </span>
                  ))}
                </div>
                <div className="edge-list">
                  {network.edges.length === 0 ? (
                    <p className="muted">Noch keine Pfeile definiert.</p>
                  ) : (
                    network.edges.map((edge) => (
                      <div key={edge.id} className="edge-row">
                        <select
                          className="edge-select"
                          value={edge.source}
                          onChange={(event) =>
                            handleEdgeChange(edge.id, "source", event.target.value)
                          }
                        >
                          {network.assignments.map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.name}
                            </option>
                          ))}
                        </select>
                        <span className="edge-arrow">→</span>
                        <select
                          className="edge-select"
                          value={edge.target}
                          onChange={(event) =>
                            handleEdgeChange(edge.id, "target", event.target.value)
                          }
                        >
                          {network.assignments.map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.name}
                            </option>
                          ))}
                        </select>
                        <select
                          className="edge-select edge-type"
                          value={edge.type}
                          onChange={(event) =>
                            handleEdgeChange(edge.id, "type", event.target.value)
                          }
                        >
                          <option value="Hauptpfad">Hauptpfad</option>
                          <option value="Nebenpfad">Nebenpfad</option>
                          <option value="Verzweigung">Verzweigung</option>
                        </select>
                      </div>
                    ))
                  )}
                </div>
              </div>
            <div className="hint-card">
              <h4>Modell-Check</h4>
              <ul>
                <li>Markiere Nebenprodukte klar, damit Abzweigungen korrekt gewichtet werden.</li>
                <li>Zwischenprodukte sollten mindestens eine eingehende und eine ausgehende Kante haben.</li>
                <li>Unklare Pfade kannst du als Nebenpfad markieren und später vergleichen.</li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      <div className="modeling-footer">
        <div className="modeling-guidance">
          <h4>Automatische Hinweise</h4>
          {guidanceNotes.length === 0 ? (
            <p className="muted">Alle Basisprüfungen sind erfüllt. Du kannst mit dem Fit starten.</p>
          ) : (
            <ul>
              {guidanceNotes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          )}
        </div>
        <div className="action-row">
          <button type="button" className="btn btn-ghost" onClick={onBack}>
            Zurück zur Analyse
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={network.assignments.length === 0}
            onClick={onConfirm}
          >
            Weiter zum Modeling
          </button>
        </div>
      </div>
    </div>
  );
};
