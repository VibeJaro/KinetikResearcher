export type RepresentativityCategory =
  | "material_mismatch"
  | "temperature_mismatch"
  | "concentration_mismatch"
  | "batch_or_charge_note"
  | "procedure_variant"
  | "other_inconsistency";

export type RepresentativityFinding = {
  category: RepresentativityCategory;
  snippet: string;
  sourceColumn: string;
  note?: string;
};

export type FitRecommendation = "good" | "review" | "caution";

export type ExperimentRepresentativityResult = {
  experimentId: string;
  experimentName: string;
  status: "pending" | "running" | "no_findings" | "findings" | "error";
  findings: RepresentativityFinding[];
  model: "gpt-5-mini-2025-08-07" | "gpt-5-mini";
  fitRecommendation: FitRecommendation;
  summary?: string;
  requestId?: string;
  usedColumns?: { reference: string[]; context: string[] };
  error?: string;
};

type RepresentativityOntologyEntry = {
  id: RepresentativityCategory;
  label: string;
  description: string;
  icon: string;
  shortHint: string;
};

export const representativityOntology: RepresentativityOntologyEntry[] = [
  {
    id: "material_mismatch",
    label: "Material-/Edukt-Mismatch",
    description:
      "Kommentar nennt andere Stoffe, Mischungen oder Chargen als die Referenzspalte.",
    icon: "🧪",
    shortHint: "Stoffangabe abweichend"
  },
  {
    id: "temperature_mismatch",
    label: "Temperaturabweichung",
    description: "Temperaturangaben in Kommentaren widersprechen der Temperaturspalte.",
    icon: "🌡️",
    shortHint: "Temp. inkonsistent"
  },
  {
    id: "concentration_mismatch",
    label: "Konzentrations- oder Mengenabweichung",
    description: "Kommentar nennt andere Konzentrationen, Volumina oder Mengen.",
    icon: "⚗️",
    shortHint: "Konzentration/Menge weicht ab"
  },
  {
    id: "batch_or_charge_note",
    label: "Charge/Sondermaterial",
    description: "Spezielle Charge, Mischung oder Sondermaterial ist genannt.",
    icon: "🏷️",
    shortHint: "Charge/Sondermaterial"
  },
  {
    id: "procedure_variant",
    label: "Ablaufvariante",
    description: "Kommentar weist auf eine Variante im Ablauf oder Setup hin.",
    icon: "🔧",
    shortHint: "Ablaufvariante"
  },
  {
    id: "other_inconsistency",
    label: "Sonstige Inkonsistenz",
    description: "Andere Inkonsistenzen zwischen Referenz- und Kontextspalten.",
    icon: "❓",
    shortHint: "Weitere Abweichung"
  }
];
