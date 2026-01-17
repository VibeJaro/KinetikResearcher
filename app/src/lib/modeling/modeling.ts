import type { Experiment } from "../../types/experiment";
import type {
  ModelingPlan,
  ModelingScenario,
  ModelingScenarioKind,
  NetworkEdge,
  ReactionNetwork,
  RoleKey,
  SpeciesAssignment
} from "../../types/modeling";

const roleDefaults: RoleKey[] = ["reactant", "intermediate", "product"];

export const createAssignmentsFromSeries = (
  seriesNames: string[],
  previous: SpeciesAssignment[] = []
): SpeciesAssignment[] => {
  const previousByColumn = new Map(previous.map((item) => [item.column, item]));
  return seriesNames.map((name, index) => {
    const existing = previousByColumn.get(name);
    if (existing) return existing;
    return {
      id: `species-${index}-${name}`,
      name,
      column: name,
      role: roleDefaults[index] ?? "intermediate"
    };
  });
};

const createEdge = (source: string, target: string, index: number): NetworkEdge => ({
  id: `edge-${index}-${source}-${target}`,
  source,
  target,
  type: "Hauptpfad"
});

export const ensureNetworkEdges = (
  assignments: SpeciesAssignment[],
  previous: NetworkEdge[]
): NetworkEdge[] => {
  const validIds = new Set(assignments.map((item) => item.id));
  const filtered = previous.filter(
    (edge) => validIds.has(edge.source) && validIds.has(edge.target)
  );
  if (filtered.length > 0) {
    return filtered;
  }
  if (assignments.length < 2) {
    return [];
  }
  const generated: NetworkEdge[] = [];
  for (let i = 0; i < assignments.length - 1; i += 1) {
    generated.push(createEdge(assignments[i].id, assignments[i + 1].id, i + 1));
  }
  return generated;
};

export const buildReactionNetwork = (
  seriesNames: string[],
  previous?: ReactionNetwork
): ReactionNetwork => {
  const assignments = createAssignmentsFromSeries(seriesNames, previous?.assignments ?? []);
  const edges = ensureNetworkEdges(assignments, previous?.edges ?? []);
  const sameColumns =
    previous?.assignments.length === assignments.length &&
    assignments.every((item, index) => item.column === previous?.assignments[index]?.column);
  return {
    assignments,
    edges,
    confirmed: sameColumns ? previous?.confirmed ?? false : false
  };
};

const mean = (values: number[]): number =>
  values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;

const slope = (x: number[], y: number[]): number => {
  if (x.length === 0 || y.length === 0 || x.length !== y.length) return 0;
  const avgX = mean(x);
  const avgY = mean(y);
  let numerator = 0;
  let denominator = 0;
  for (let i = 0; i < x.length; i += 1) {
    const dx = x[i] - avgX;
    numerator += dx * (y[i] - avgY);
    denominator += dx * dx;
  }
  return denominator === 0 ? 0 : numerator / denominator;
};

const detectDeactivationSignal = (
  experiments: Experiment[],
  network: ReactionNetwork
): boolean => {
  const reactantColumns = new Set(
    network.assignments.filter((item) => item.role === "reactant").map((item) => item.column)
  );
  if (reactantColumns.size === 0) return false;
  return experiments.some((experiment) =>
    experiment.series.some((series) => {
      if (!reactantColumns.has(series.name) || series.time.length < 6) return false;
      const splitIndex = Math.floor(series.time.length / 2);
      const earlySlope = slope(
        series.time.slice(0, splitIndex),
        series.y.slice(0, splitIndex)
      );
      const lateSlope = slope(
        series.time.slice(splitIndex),
        series.y.slice(splitIndex)
      );
      return Math.abs(lateSlope) < Math.abs(earlySlope) * 0.5 && Math.abs(earlySlope) > 0;
    })
  );
};

const detectUnknownSidePaths = (network: ReactionNetwork): boolean => {
  const hasSideRoles = network.assignments.some((item) => item.role === "side");
  if (hasSideRoles) return true;
  if (network.edges.some((edge) => edge.type !== "Hauptpfad")) return true;
  const edgeIds = new Set(
    network.edges.flatMap((edge) => [edge.source, edge.target])
  );
  return network.assignments.some((item) => !edgeIds.has(item.id));
};

const networkSummary = (network: ReactionNetwork): string => {
  if (network.assignments.length === 0) {
    return "Keine Komponenten zugewiesen.";
  }
  const mainEdges = network.edges.filter((edge) => edge.type === "Hauptpfad").length;
  const sideEdges = network.edges.filter((edge) => edge.type !== "Hauptpfad").length;
  return `${network.assignments.length} Komponenten · ${mainEdges} Hauptpfade · ${sideEdges} Neben-/Verzweigungen`;
};

export const buildModelingScenarios = (
  experiments: Experiment[],
  network: ReactionNetwork
): ModelingScenario[] => {
  const deactivation = detectDeactivationSignal(experiments, network);
  const unknownSide = detectUnknownSidePaths(network);
  return [
    {
      id: "scenario-clean",
      kind: "clean-kinetics",
      label: "Saubere Kinetik (ohne Sonderfälle)",
      description: "Nutze das Netzwerk wie definiert, ohne zusätzliche Verlustpfade.",
      assumptions: ["Keine Deaktivierung", "Keine zusätzlichen Nebenpfade außerhalb des Netzwerks"],
      recommended: !deactivation && !unknownSide
    },
    {
      id: "scenario-deactivation",
      kind: "catalyst-deactivation",
      label: "Kat-Deaktivierung berücksichtigen",
      description: "Erweitert das Modell um einen Deaktivierungsfaktor für den Katalysator.",
      assumptions: ["Reaktivität nimmt über die Zeit ab", "Deaktivierung wirkt auf Hauptpfad"],
      recommended: deactivation
    },
    {
      id: "scenario-sidepaths",
      kind: "unknown-side-paths",
      label: "Unbekannte Nebenpfade zulassen",
      description: "Schätzt zusätzliche Verlustpfade, falls Nebenprodukte nicht vollständig erfasst sind.",
      assumptions: [
        "Ein Teil des Edukts fließt in nicht gemessene Nebenpfade",
        "Unbekannte Pfade werden als Verlustterm modelliert"
      ],
      recommended: unknownSide
    }
  ];
};

const scenarioParameters: Record<ModelingScenarioKind, string[]> = {
  "clean-kinetics": ["k_1", "k_2", "k_3"],
  "catalyst-deactivation": ["k_1", "k_2", "k_deact", "E_deact"],
  "unknown-side-paths": ["k_1", "k_2", "k_side_loss"]
};

export const buildModelingPlan = (
  network: ReactionNetwork,
  scenario: ModelingScenario
): ModelingPlan => {
  const parameters = scenarioParameters[scenario.kind] ?? ["k_1"];
  const warnings: string[] = [];
  if (scenario.kind === "catalyst-deactivation") {
    warnings.push("Deaktivierung erhöht die Modellkomplexität – prüfe die Datenqualität.");
  }
  if (scenario.kind === "unknown-side-paths") {
    warnings.push("Zusätzliche Nebenpfade können Fit-Parameter entkoppeln.");
  }
  return {
    scenario: scenario.kind,
    parameters,
    assumptions: scenario.assumptions,
    warnings,
    networkSummary: networkSummary(network)
  };
};
