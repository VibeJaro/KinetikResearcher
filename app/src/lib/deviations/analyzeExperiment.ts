import type { Experiment } from "../../types/experiment";
import type { DeviationCategory, DeviationFinding } from "../../types/deviations";

const detectors: { category: DeviationCategory; patterns: RegExp[] }[] = [
  {
    category: "Apparatur- oder Anlagenprobleme",
    patterns: [/(leck|undicht|leckage|druckverlust|defekt|sensor|rührer|ventil|pumpe)/i]
  },
  {
    category: "Abweichender Dosier- oder Zugabemodus",
    patterns: [/(portion|portionen|tropf|tropfenweise|langsam|dosier|pumpe|gepumpt|kontinuierlich)/i]
  },
  {
    category: "Temperatur- oder Druckinstabilität",
    patterns: [/(temperatur.*(schwank|abweich)|überhitz|kühlung|heizung|druck.*(schwank|abfall))/i]
  },
  {
    category: "Geänderte Reihenfolge oder veränderter Ablauf",
    patterns: [/(reihenfolge|zuerst|später|nachträglich|umgestellt|ablauf geändert|vorab)/i]
  },
  {
    category: "Probleme mit Materialqualität oder Verunreinigungen",
    patterns: [/(feucht|wasser|verunreinigung|kontamination|qualit|alt|schlecht|verunreinigt)/i]
  },
  {
    category: "Unerwartete Ereignisse oder Zwischenfälle",
    patterns: [/(abbruch|notabschaltung|runaway|exotherm|gasentwicklung|verfärb|zwischenfall|unfall)/i]
  },
  {
    category: "Explizite Warnungen oder Einschränkungen",
    patterns: [/(vorsicht|vorsichtig|warnung|unsicher|nicht vergleichbar|eingeschränkt)/i]
  },
  {
    category: "Geänderter Aufarbeitungs- oder Isolationsschritt",
    patterns: [/(quench|extraktion|filtration|destillation|trocknung|aufarbeitung|isolation)/i]
  },
  {
    category: "Probleme bei Analytik oder Probenahme",
    patterns: [/(analytik|messung|messfehler|gc|hplc|nmr|probenverlust|peakproblem|probe verloren)/i]
  },
  {
    category: "Explizite Angabe zentraler Versuchsparameter im Kommentar",
    patterns: [/(\b°C\b|grad|temperatur|konzentration|mol|mol%|äquiv|äquivalent|druck|bar|rpm|stirring|dosiert)/i]
  }
];

export const analyzeExperimentForDeviations = (
  experiment: Experiment,
  commentColumns: string[]
): DeviationFinding[] => {
  if (!commentColumns.length) {
    return [];
  }

  const findings: DeviationFinding[] = [];

  commentColumns.forEach((column) => {
    const values = experiment.columnValues?.[column] ?? [];
    values.forEach((value) => {
      if (!value || typeof value !== "string") return;
      detectors.forEach((detector) => {
        const matched = detector.patterns.some((pattern) => pattern.test(value));
        if (matched) {
          findings.push({
            category: detector.category,
            snippet: value.trim().slice(0, 280),
            sourceColumn: column
          });
        }
      });
    });
  });

  const unique = new Map<string, DeviationFinding>();
  findings.forEach((finding) => {
    const key = `${finding.category}-${finding.sourceColumn}-${finding.snippet}`;
    if (!unique.has(key)) {
      unique.set(key, finding);
    }
  });

  return Array.from(unique.values());
};
