import type { DeviationCategory, ExperimentDeviationResult } from "./deviationAnalysis";
import type {
  ExperimentRepresentativityResult,
  RepresentativityCategory
} from "./representativityAnalysis";

export type DeviationAnalysisState = {
  selectedDeviationColumns: string[];
  selectedParameterColumns: string[];
  results: Record<string, ExperimentDeviationResult>;
  representativityResults: Record<string, ExperimentRepresentativityResult>;
  fitSelection: Record<string, boolean>;
  hideClean: boolean;
  categoryFilter: DeviationCategory | "all";
  representativityFilter: RepresentativityCategory | "all";
};
