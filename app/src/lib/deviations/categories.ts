export const ONTOLOGY_CATEGORIES = [
  "instrument_issue",
  "calibration_gap",
  "contamination_suspected",
  "sampling_error",
  "data_entry_problem",
  "procedure_deviation",
  "unexpected_reaction",
  "environmental_condition",
  "missing_context",
  "quality_control_flag"
] as const;

export type DeviationCategory = (typeof ONTOLOGY_CATEGORIES)[number];

export const isDeviationCategory = (value: unknown): value is DeviationCategory =>
  typeof value === "string" && (ONTOLOGY_CATEGORIES as readonly string[]).includes(value);
