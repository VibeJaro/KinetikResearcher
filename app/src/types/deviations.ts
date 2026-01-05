export type DeviationCategory =
  | "Apparatur- oder Anlagenprobleme"
  | "Abweichender Dosier- oder Zugabemodus"
  | "Temperatur- oder Druckinstabilität"
  | "Geänderte Reihenfolge oder veränderter Ablauf"
  | "Probleme mit Materialqualität oder Verunreinigungen"
  | "Unerwartete Ereignisse oder Zwischenfälle"
  | "Explizite Warnungen oder Einschränkungen"
  | "Geänderter Aufarbeitungs- oder Isolationsschritt"
  | "Probleme bei Analytik oder Probenahme"
  | "Explizite Angabe zentraler Versuchsparameter im Kommentar";

export type DeviationFinding = {
  category: DeviationCategory;
  snippet: string;
  sourceColumn: string;
};

export const deviationOntology: { key: DeviationCategory; description: string }[] = [
  {
    key: "Apparatur- oder Anlagenprobleme",
    description:
      "Hinweise auf Leckagen, Druckverlust, defekte Bauteile, undichte Schläuche, Ventile, Rührer, Pumpen, Sensoren oder ähnliche technische Probleme."
  },
  {
    key: "Abweichender Dosier- oder Zugabemodus",
    description:
      "Hinweise darauf, dass Edukte oder Reagenzien nicht wie üblich zugegeben wurden (z. B. portionsweise, langsam, verteilt über Zeit, per Pumpe)."
  },
  {
    key: "Temperatur- oder Druckinstabilität",
    description:
      "Erwähnungen von Schwankungen, Abweichungen, unerwarteten Änderungen oder Schwierigkeiten beim Halten von Temperatur oder Druck."
  },
  {
    key: "Geänderte Reihenfolge oder veränderter Ablauf",
    description:
      "Hinweise darauf, dass Schritte in anderer Reihenfolge durchgeführt wurden oder der Ablauf bewusst angepasst wurde."
  },
  {
    key: "Probleme mit Materialqualität oder Verunreinigungen",
    description:
      "Erwähnungen von Feuchtigkeit, Wasser, Verunreinigungen, falscher Qualität, alter Chemikalien oder unerwarteten Nebenstoffen."
  },
  {
    key: "Unerwartete Ereignisse oder Zwischenfälle",
    description:
      "Hinweise auf Abbruch, Notabschaltung, Sicherheitsereignisse, unkontrollierte Reaktionen, starke Gasentwicklung, Verfärbungen oder ähnliche Vorfälle."
  },
  {
    key: "Explizite Warnungen oder Einschränkungen",
    description:
      "Direkte Hinweise des Autors, dass Ergebnisse vorsichtig zu interpretieren sind oder nicht vergleichbar sein könnten."
  },
  {
    key: "Geänderter Aufarbeitungs- oder Isolationsschritt",
    description:
      "Hinweise auf Änderungen bei Quench, Extraktion, Filtration, Destillation, Trocknung oder ähnlichen Nacharbeitsschritten."
  },
  {
    key: "Probleme bei Analytik oder Probenahme",
    description:
      "Erwähnungen von fehlerhaften Messungen, unklaren Analysedaten, Problemen bei GC, HPLC, NMR oder Probenverlust."
  },
  {
    key: "Explizite Angabe zentraler Versuchsparameter im Kommentar",
    description:
      "Aussagen im Kommentar zu Stoffidentitäten, Mengen, Konzentrationen oder Bedingungen, die offensichtlich wichtig sind und im Kommentar hervorgehoben werden."
  }
];
