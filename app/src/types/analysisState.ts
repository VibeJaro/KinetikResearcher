import type { ExperimentDeviationResult } from "./deviationAnalysis";
import type { ExperimentRepresentativityResult } from "./representativityAnalysis";

export type DeviationAnalysisState = {
  selectedDeviationColumns: string[];
  selectedParameterColumns: string[];
  results: Record<string, ExperimentDeviationResult>;
  representativityResults: Record<string, ExperimentRepresentativityResult>;
  fitSelection: Record<string, boolean>;
};
