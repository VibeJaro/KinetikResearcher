export type DeviationCategory =
  | "apparatus_issue"
  | "dosing_mode_change"
  | "temp_pressure_instability"
  | "procedure_change"
  | "material_quality"
  | "unexpected_event"
  | "explicit_warning"
  | "workup_change"
  | "analytics_issue"
  | "explicit_parameter_in_comment";

export type DeviationFinding = {
  category: DeviationCategory;
  snippet: string;
  sourceColumn: string;
  note?: string;
};

export type ExperimentDeviationResult = {
  experimentId: string;
  experimentName: string;
  status: "pending" | "running" | "no_findings" | "findings" | "error";
  findings: DeviationFinding[];
  model: "gpt-5-mini-2025-08-07" | "gpt-5-mini";
  requestId?: string;
  usedColumns?: { deviation: string[]; parameters: string[] };
  error?: string;
};

type DeviationOntologyEntry = {
  id: DeviationCategory;
  label: string;
  description: string;
  icon: string;
  shortHint: string;
};

export const deviationOntology: DeviationOntologyEntry[] = [
  {
    id: "apparatus_issue",
    label: "Apparatur- oder Anlagenprobleme",
    description:
      "Leckagen, Druckverlust, defekte oder undichte Komponenten, Sensor-/Pumpen-/Rührerprobleme.",
    icon: "⚙️",
    shortHint: "Apparaturproblem erwähnt"
  },
  {
    id: "dosing_mode_change",
    label: "Abweichender Dosier- oder Zugabemodus",
    description: "Zugaben portionsweise, langsam, verteilt über Zeit, per Pumpe o.Ä.",
    icon: "➕",
    shortHint: "Zugabe-Modus geändert"
  },
  {
    id: "temp_pressure_instability",
    label: "Temperatur- oder Druckinstabilität",
    description: "Schwankungen, Abweichungen oder Probleme beim Halten von Temperatur/Druck.",
    icon: "🌡️",
    shortHint: "Temp./Druck instabil"
  },
  {
    id: "procedure_change",
    label: "Geänderte Reihenfolge oder veränderter Ablauf",
    description: "Schritte anders sortiert oder bewusst angepasst.",
    icon: "🔄",
    shortHint: "Ablauf/Reihenfolge anders"
  },
  {
    id: "material_quality",
    label: "Probleme mit Materialqualität oder Verunreinigungen",
    description: "Feuchtigkeit, falsche Qualität, alte Chemikalien, Nebenstoffe.",
    icon: "🧪",
    shortHint: "Materialqualität fraglich"
  },
  {
    id: "unexpected_event",
    label: "Unerwartete Ereignisse oder Zwischenfälle",
    description: "Abbruch, Notabschaltung, unkontrollierte Reaktion, starke Gasentwicklung, Verfärbung.",
    icon: "⚠️",
    shortHint: "Unerwartetes Ereignis"
  },
  {
    id: "explicit_warning",
    label: "Explizite Warnungen oder Einschränkungen",
    description: "Autor:innen warnen vor Vergleichbarkeit oder fordern Vorsicht.",
    icon: "❗",
    shortHint: "Warnhinweis im Kommentar"
  },
  {
    id: "workup_change",
    label: "Geänderter Aufarbeitungs- oder Isolationsschritt",
    description: "Anpassungen bei Quench, Extraktion, Filtration, Destillation, Trocknung etc.",
    icon: "🧴",
    shortHint: "Aufarbeitung geändert"
  },
  {
    id: "analytics_issue",
    label: "Probleme bei Analytik oder Probenahme",
    description: "Fehlerhafte Messungen, unklare Daten, Probleme mit GC/HPLC/NMR, Probenverlust.",
    icon: "📈",
    shortHint: "Analytik/Probenahme problematisch"
  },
  {
    id: "explicit_parameter_in_comment",
    label: "Explizite Angabe zentraler Versuchsparameter im Kommentar",
    description: "Stoffidentitäten, Mengen, Konzentrationen oder Bedingungen, die im Kommentar betont werden.",
    icon: "ℹ️",
    shortHint: "Parameter im Kommentar genannt"
  }
];

export const deviationResultSchema = {
  type: "object",
  required: ["experimentId", "experimentName", "model", "status", "findings"],
  properties: {
    experimentId: { type: "string" },
    experimentName: { type: "string" },
    model: { type: "string", enum: ["gpt-5-mini-2025-08-07", "gpt-5-mini"] },
    status: { type: "string", enum: ["no_findings", "findings"] },
    findings: {
      type: "array",
      items: {
        type: "object",
        required: ["category", "snippet", "sourceColumn"],
        properties: {
          category: {
            type: "string",
            enum: deviationOntology.map((entry) => entry.id)
          },
          snippet: { type: "string" },
          sourceColumn: { type: "string" },
          note: { type: "string" }
        },
        additionalProperties: false
      }
    },
    usedColumns: {
      type: "object",
      properties: {
        deviation: { type: "array", items: { type: "string" } },
        parameters: { type: "array", items: { type: "string" } }
      }
    },
    requestId: { type: "string" },
    error: { type: "string" }
  },
  additionalProperties: false
} as const;
