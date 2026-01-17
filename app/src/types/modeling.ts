export type RoleKey = "reactant" | "product" | "intermediate" | "side";

export type SpeciesAssignment = {
  id: string;
  name: string;
  column: string;
  role: RoleKey;
};

export type NetworkEdge = {
  id: string;
  source: string;
  target: string;
  type: "Hauptpfad" | "Nebenpfad" | "Verzweigung";
};

export type ReactionNetwork = {
  assignments: SpeciesAssignment[];
  edges: NetworkEdge[];
  confirmed: boolean;
};

export type ModelingScenarioKind =
  | "clean-kinetics"
  | "catalyst-deactivation"
  | "unknown-side-paths";

export type ModelingScenario = {
  id: string;
  kind: ModelingScenarioKind;
  label: string;
  description: string;
  assumptions: string[];
  recommended: boolean;
};

export type ModelingPlan = {
  scenario: ModelingScenarioKind;
  parameters: string[];
  assumptions: string[];
  warnings: string[];
  networkSummary: string;
};
