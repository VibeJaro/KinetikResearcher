export type DeviationCategory =
  | "apparatus_issue"
  | "dosing_mode"
  | "temp_pressure_instability"
  | "sequence_change"
  | "material_quality"
  | "unexpected_event"
  | "explicit_warning"
  | "workup_change"
  | "analytics_issue"
  | "comment_parameters";

export type DeviationObservation = {
  category: DeviationCategory;
  snippet: string;
  sourceColumns: string[];
};

export type DeviationOntologyItem = {
  key: DeviationCategory;
  label: string;
  icon: string;
  description: string;
};

export type ExperimentDeviationResult = {
  experimentId: string;
  experimentName?: string;
  observations: DeviationObservation[];
  commentContext: Record<string, string>;
  parameterEcho: Record<string, string | number | null>;
};

export type DeviationAnalysisRequest = {
  experimentId: string;
  experimentName?: string;
  commentColumns: string[];
  parameterColumns: string[];
  commentContext: Record<string, string>;
  parameterEcho: Record<string, string | number | null>;
  ontology: DeviationOntologyItem[];
};

export const deviationResultSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://kinetik-researcher.dev/schemas/deviation-analysis.json",
  title: "DeviationAnalysisResult",
  type: "object",
  required: ["experimentId", "observations", "commentContext", "parameterEcho"],
  properties: {
    experimentId: { type: "string", description: "ID der Messreihe" },
    experimentName: { type: "string", description: "Optionaler Anzeigename" },
    observations: {
      type: "array",
      items: {
        type: "object",
        required: ["category", "snippet", "sourceColumns"],
        properties: {
          category: {
            type: "string",
            enum: [
              "apparatus_issue",
              "dosing_mode",
              "temp_pressure_instability",
              "sequence_change",
              "material_quality",
              "unexpected_event",
              "explicit_warning",
              "workup_change",
              "analytics_issue",
              "comment_parameters"
            ]
          },
          snippet: {
            type: "string",
            description: "Originaltext-Ausschnitt, auf dem die Erkennung basiert"
          },
          sourceColumns: {
            type: "array",
            items: { type: "string" },
            description: "Kommentarspalten, aus denen der Hinweis stammt"
          }
        }
      }
    },
    commentContext: {
      type: "object",
      additionalProperties: { type: "string" },
      description: "Kommentare, die dem LLM gezeigt wurden"
    },
    parameterEcho: {
      type: "object",
      additionalProperties: {
        anyOf: [{ type: "string" }, { type: "number" }, { type: "null" }]
      },
      description: "Referenz-Parameterwerte, die das LLM pro Experiment sieht"
    }
  }
} as const;
