import { useMemo, useState } from "react";

type RoleKey = "reactant" | "product" | "intermediate" | "side";

type SpeciesAssignment = {
  id: string;
  name: string;
  column: string;
  role: RoleKey;
};

type NetworkEdge = {
  id: string;
  source: string;
  target: string;
  type: "Hauptpfad" | "Nebenpfad" | "Verzweigung";
};

const roleOptions: { value: RoleKey; label: string; hint: string }[] = [
  { value: "reactant", label: "Edukt", hint: "Startstoffe im Reaktionspfad." },
  { value: "product", label: "Produkt", hint: "Zielmolekül oder Hauptprodukt." },
  { value: "intermediate", label: "Zwischenprodukt", hint: "Kurzlebige Station im Pfad." },
  { value: "side", label: "Nebenprodukt", hint: "Abzweig oder unerwünschtes Produkt." }
];

const initialAssignments: SpeciesAssignment[] = [
  { id: "A", name: "Substanz A", column: "A_conc", role: "reactant" },
  { id: "B", name: "Substanz B", column: "B_conc", role: "intermediate" },
  { id: "C", name: "Substanz C", column: "C_conc", role: "product" },
  { id: "D", name: "Nebenprodukt D", column: "D_conc", role: "side" }
];

const initialEdges: NetworkEdge[] = [
  { id: "edge-1", source: "A", target: "B", type: "Hauptpfad" },
  { id: "edge-2", source: "B", target: "C", type: "Hauptpfad" },
  { id: "edge-3", source: "A", target: "D", type: "Nebenpfad" }
];

const createEdge = (source: string, target: string, index: number): NetworkEdge => ({
  id: `edge-${index}-${source}-${target}`,
  source,
  target,
  type: "Hauptpfad"
});

export const ModelingScreen = () => {
  const [assignments, setAssignments] = useState<SpeciesAssignment[]>(initialAssignments);
  const [edges, setEdges] = useState<NetworkEdge[]>(initialEdges);

  const speciesMap = useMemo(() => {
    return assignments.reduce<Record<string, SpeciesAssignment>>((acc, item) => {
      acc[item.id] = item;
      return acc;
    }, {});
  }, [assignments]);

  const roleCounts = useMemo(() => {
    return roleOptions.map((role) => ({
      role: role.value,
      label: role.label,
      count: assignments.filter((item) => item.role === role.value).length
    }));
  }, [assignments]);

  const guidanceNotes = useMemo(() => {
    const notes: string[] = [];
    if (!assignments.some((item) => item.role === "product")) {
      notes.push("Noch kein Produkt markiert – bitte mindestens ein Produkt auswählen.");
    }
    if (!assignments.some((item) => item.role === "reactant")) {
      notes.push("Es fehlt ein Edukt. Mindestens ein Startstoff ist nötig.");
    }
    if (edges.length === 0) {
      notes.push("Lege mindestens einen Pfeil an, damit das Netzwerk modelliert werden kann.");
    }
    return notes;
  }, [assignments, edges]);

  const handleRoleChange = (id: string, nextRole: RoleKey) => {
    setAssignments((prev) =>
      prev.map((item) => (item.id === id ? { ...item, role: nextRole } : item))
    );
  };

  const handleEdgeChange = (id: string, key: "source" | "target" | "type", value: string) => {
    setEdges((prev) =>
      prev.map((edge) => (edge.id === id ? { ...edge, [key]: value } : edge))
    );
  };

  const handleAddEdge = () => {
    const first = assignments[0]?.id;
    const second = assignments[1]?.id ?? first;
    if (!first || !second) return;
    setEdges((prev) => [...prev, createEdge(first, second, prev.length + 1)]);
  };

  return (
    <div className="modeling-screen" aria-labelledby="modeling-heading">
      <div className="section-intro">
        <p className="eyebrow">Schritt 4 · Modeling</p>
        <h2 id="modeling-heading">Reaktionsnetzwerk vorbereiten</h2>
        <p className="muted">
          Bevor der Fit startet, ordnest du die gemessenen Spalten den Rollen zu und definierst
          den Pfad zwischen den Komponenten. So ist eindeutig, wo Nebenprodukte entstehen.
        </p>
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
              {assignments.map((item) => (
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
              ))}
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
                Verbinde Quellen und Ziele. Markiere Nebenpfade, damit der Fit Nebenprodukte korrekt
                behandelt.
              </p>
            </div>
            <button type="button" className="btn btn-ghost" onClick={handleAddEdge}>
              + Pfeil hinzufügen
            </button>
          </div>
          <div className="card-body">
            <div className="network-canvas">
              <div className="network-visual">
                {assignments.map((item) => (
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
                {edges.map((edge) => (
                  <div key={edge.id} className="edge-row">
                    <select
                      className="edge-select"
                      value={edge.source}
                      onChange={(event) => handleEdgeChange(edge.id, "source", event.target.value)}
                    >
                      {assignments.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                    </select>
                    <span className="edge-arrow">→</span>
                    <select
                      className="edge-select"
                      value={edge.target}
                      onChange={(event) => handleEdgeChange(edge.id, "target", event.target.value)}
                    >
                      {assignments.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                    </select>
                    <select
                      className="edge-select edge-type"
                      value={edge.type}
                      onChange={(event) => handleEdgeChange(edge.id, "type", event.target.value)}
                    >
                      <option value="Hauptpfad">Hauptpfad</option>
                      <option value="Nebenpfad">Nebenpfad</option>
                      <option value="Verzweigung">Verzweigung</option>
                    </select>
                  </div>
                ))}
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
          <button type="button" className="btn btn-ghost">
            Zurück zur Analyse
          </button>
          <button type="button" className="btn btn-primary">
            Netzwerk bestätigen
          </button>
        </div>
      </div>
    </div>
  );
};
