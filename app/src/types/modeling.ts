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

export type ModelingChartPoint = {
  x: number;
  y: number;
  yFit: number;
};

export type ModelingPreflightStatus = "ok" | "warning" | "fail";

export type ModelingPreflightCheck = {
  id: string;
  title: string;
  status: ModelingPreflightStatus;
  detail: string;
  nextStep: string;
};

export type ModelingPreflight = {
  checks: ModelingPreflightCheck[];
  summary: string;
};

export type ModelingCandidate = {
  id: string;
  label: string;
  family: "Massenwirkung" | "Empirisch" | "LHHW" | "Reversibel" | "Inhibition";
  rationale: string;
  parameterCount: number;
  recommended: boolean;
  llmSummary: string;
};

export type ModelingParameter = {
  name: string;
  value: number;
  unit: string;
  min: number;
  max: number;
  uncertainty: number;
  status: "ok" | "review";
};

export type ModelingDiagnostics = {
  residualPattern: string;
  warnings: string[];
  recommendation: string;
  llmSummary: string;
};

export type ModelingScriptRun = {
  scriptName: string;
  version: string;
  inputSummary: string;
  outputSummary: string;
  ranAt: string;
};

export type ModelingVariantMetrics = {
  r2: number;
  rmse: number;
  aic: number;
  bic: number;
  score: number;
};

export type ModelingVariant = {
  id: string;
  label: string;
  assumptions: string[];
  options: ModelingOptions;
  plan: ModelingPlan;
  equations: string[];
  metrics: ModelingVariantMetrics;
  parametersDetail: ModelingParameter[];
  diagnostics: ModelingDiagnostics;
  parameters: number;
  experimentCount: number;
  seriesCount: number;
  pointCount: number;
  chart: ModelingChartPoint[];
  isSelected: boolean;
};

export type ModelingRun = {
  requestedAt: string;
  variants: ModelingVariant[];
  topVariantIds: string[];
  preflight: ModelingPreflight;
  candidates: ModelingCandidate[];
  auditTrail: ModelingScriptRun[];
  llmGuidance: string[];
  summary: {
    experimentCount: number;
    seriesCount: number;
    pointCount: number;
    variantCount: number;
  };
  log: string[];
};
