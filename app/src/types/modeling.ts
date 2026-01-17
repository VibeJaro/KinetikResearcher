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

export type ReactionNetworkState = {
  assignments: SpeciesAssignment[];
  edges: NetworkEdge[];
  confirmed: boolean;
  confirmedAt?: string;
};

export type DeactivationModel = "first_order" | "time_on_stream";

export type ModelingOptions = {
  includeDeactivation: boolean;
  deactivationModel: DeactivationModel;
  includeUnknownSidePaths: boolean;
};

export type ReactionDefinition = {
  id: string;
  source: string;
  target: string;
  type: NetworkEdge["type"] | "Deaktivierung" | "Unbekannter Nebenpfad";
  rateLaw: string;
  description: string;
};

export type ModelingPlan = {
  species: SpeciesAssignment[];
  reactions: ReactionDefinition[];
  options: ModelingOptions;
  notes: string[];
};
