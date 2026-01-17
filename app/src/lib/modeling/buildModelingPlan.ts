import type {
  ModelingOptions,
  ModelingPlan,
  ReactionNetworkState,
  ReactionDefinition
} from "../../types/modeling";

const buildRateLaw = (kind: ReactionDefinition["type"], sourceName: string): string => {
  switch (kind) {
    case "Deaktivierung":
      return "k_d * activity";
    case "Unbekannter Nebenpfad":
      return `k_side * ${sourceName}`;
    default:
      return `k * ${sourceName}`;
  }
};

const describeEdge = (kind: ReactionDefinition["type"]): string => {
  switch (kind) {
    case "Nebenpfad":
      return "Abzweig mit separater Nebenpfad-Konstante.";
    case "Verzweigung":
      return "Mehrfachabzweig mit konkurrierenden Pfaden.";
    case "Deaktivierung":
      return "Abnahme der katalytischen Aktivität über die Zeit.";
    case "Unbekannter Nebenpfad":
      return "Zusätzlicher Pfad ohne konkrete Spezies, dient als Restpfad.";
    default:
      return "Hauptpfad für den Kernumsatz.";
  }
};

export const buildModelingPlan = (
  network: ReactionNetworkState,
  options: ModelingOptions
): ModelingPlan => {
  const notes: string[] = [];
  const species = network.assignments;

  if (species.length === 0) {
    return {
      species: [],
      reactions: [],
      options,
      notes: ["Keine Spaltenrollen definiert. Das Modell bleibt leer."]
    };
  }

  const reactions: ReactionDefinition[] = network.edges.map((edge) => {
    const source = species.find((item) => item.id === edge.source);
    const target = species.find((item) => item.id === edge.target);
    const sourceName = source?.name ?? "Unbekannt";
    const targetName = target?.name ?? "Unbekannt";
    return {
      id: edge.id,
      source: sourceName,
      target: targetName,
      type: edge.type,
      rateLaw: buildRateLaw(edge.type, sourceName),
      description: describeEdge(edge.type)
    };
  });

  if (options.includeUnknownSidePaths) {
    const reactants = species.filter((item) => item.role === "reactant");
    const reactantCandidates = reactants.length > 0 ? reactants : species.slice(0, 1);
    reactantCandidates.forEach((reactant, index) => {
      reactions.push({
        id: `unknown-side-${reactant.id}-${index}`,
        source: reactant.name,
        target: "Unbekannter Nebenpfad",
        type: "Unbekannter Nebenpfad",
        rateLaw: buildRateLaw("Unbekannter Nebenpfad", reactant.name),
        description: describeEdge("Unbekannter Nebenpfad")
      });
    });
    notes.push(
      "Unbekannte Nebenpfade sind aktiv: zusätzliche Restpfade absorbieren nicht beobachtete Produkte."
    );
  }

  if (options.includeDeactivation) {
    reactions.push({
      id: "deactivation",
      source: "Katalytische Aktivität",
      target: "Deaktiviert",
      type: "Deaktivierung",
      rateLaw:
        options.deactivationModel === "time_on_stream"
          ? "k_d * activity * t"
          : "k_d * activity",
      description: describeEdge("Deaktivierung")
    });
    notes.push(
      options.deactivationModel === "time_on_stream"
        ? "Deaktivierung wird mit einem zeitabhängigen Term (time-on-stream) modelliert."
        : "Deaktivierung wird als einfache Abnahme der Aktivität modelliert."
    );
  }

  if (network.edges.length === 0) {
    notes.push("Ohne definierte Pfeile kann kein dynamischer Fit berechnet werden.");
  }

  return {
    species,
    reactions,
    options,
    notes
  };
};
