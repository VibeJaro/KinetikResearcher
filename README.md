# KinetikResearcher

Ein geführter Kinetik-Assistent für Chemiker:innen und Ingenieur:innen, die schnell und sicher durch Datenimport, Validierung, Modellierung und Reporting kommen wollen – ohne Kinetik-Expert:in sein zu müssen.

## Was die App bietet
- **Geführter Flow**: Import & Mapping → Validation → Abweichungen (LLM-unterstützt, Kommentarspalten + Spalten-Abgleich) → Repräsentativitäts-Check (LLM-Abgleich mit gewählten Spalten) → Modeling/Fit → Report/Export (LLM-unterstützt).
- **Geführte UX**: verständliche Texte, empfohlene Defaults, “Warum?”-Tooltips und Undo-freundliche Aktionen.
- **Validierung auf Deutsch**: Serien-Kacheln mit Mini-Plots (Punkte + Linie), klare Kurztexte und Handlungsempfehlungen, damit auch nicht-expertische Nutzer:innen schnell entscheiden können.
- **Auditierbar**: Jede Annahme und Antwort landet im Audit-Log, ohne die vorhandenen Funktionen einzuschränken.
- **Deterministischer Kern**: Fitting, Einheiten, Plots laufen als Code; LLM nur für Hinweise, Fragen, Textbausteine.
- **LLM klar ausgewiesen**: Abweichungen werden bevorzugt mit GPT-5 mini (Snapshot 2025-08-07) erkannt; pro Experiment zwei Aufrufe (Kommentar-Scan + Spalten-Abgleich), Fallback auf gpt-5-mini.

## Design-Referenz
Das App-Layout folgt dem UI-Design-Draft unter `design/kinetik-researcher.design-draft.html` (Design-Vertrag, kein Produktionscode). Öffne die Datei im Browser, um das neue End-to-End-UI zu sehen. Implementierungen in `app/` sollen die dortige Informationsarchitektur und Kerninteraktionen funktional widerspiegeln:
 - Sticky Header mit Nutzer-Badge
 - Horizontaler Stepper mit Fortschrittsbalken (5 oder 6 Schritte je nach Darstellung von Abweichung + Repräsentativitäts-Check)
 - Card-basierte Screens im mittig ausgerichteten Container

### Screens aus dem Draft (verbindliche UX-Elemente)
- **Import**: Drag-and-Drop Upload-Zone; danach Mapping-Card mit Dropdowns und CTA „Weiter zur Validierung“. Das UI wurde bereits auf das neue Draft-Layout gehoben (Header-Badge, horizontaler Stepper, Cards). Werte-Spalten lassen sich per Mehrfachauswahl im Dropdown setzen, die Replicate-Auswahl ist entfallen, und sobald eine Experiment-Spalte gewählt ist, zeigt die Vorschau direkt die ersten 20 Experimente (jeweils erste Zeile).
- **Validation**: Serien-Kacheln mit Dauer/Point-Count, Mini-Plots (Punkte + Linie) für den Schnellcheck, deutschsprachige Hinweise (Status-Pill + Technische Details) und CTA-Leiste „Zurück/Weiter“ unten.
- **Abweichungen (LLM)**: Neuer Schritt statt Grouping. Nutzer:innen wählen Kommentar- sowie Referenz-/Hinweis-Spalten; das LLM führt pro Experiment zwei Scans (Kommentarspalten + Spalten-Abgleich) aus und markiert potenzielle Abweichungen. Ergebnis: Abweichungs-Liste inkl. Herkunftsspalte.
- **Repräsentativitäts-Check (LLM)**: Folgeschritt nach dem Abweichungsscan. Nutzer:innen wählen relevante Spalten (z.B. Zielparameter), das LLM gleicht die Abweichungen dagegen ab und zeigt, ob Experimente als repräsentativ gelten oder aussortiert werden sollten. Klare CTA-Leiste für „Zurück/Weiter“.
- **Modeling**: Zweispaltig – links Fit-Parameter inkl. Arrhenius-Checkbox + R²-Summary, rechts Chart-Card mit Legende; Abschluss-CTA „Berechnen“.
- **Report**: Zweispaltig – links Chat mit Quick-Replies und „Report Generieren“, rechts PDF-Preview mit Titelbar + Download-CTA.

## Dev-Setup
```bash
cd app
npm install
npm run dev
npm run build
npm test
```

Die Import-Logik nutzt einen Mapping-Wizard (siehe `app/src/lib/import/mapping.ts`) und eine Validierung mit klaren Hinweisen und Prioritäten (siehe `app/src/lib/import/validation.ts`). Weitere Feature-spezifische Ordner liegen unter `app/src/lib/` und `app/src/ui/` entlang der oben genannten Schritte.

### Abweichungsscan & Repräsentativitäts-Check (LLM-unterstützt)
- Nutzer:innen wählen Kommentarspalten; das LLM markiert Auffälligkeiten pro Experiment (Kategorien/Labels werden ergänzt). Die Analyse erfolgt bevorzugt via GPT-5 mini (Snapshot 2025-08-07), ein Call pro Experiment, mit Fallback auf gpt-5-mini.
- Zusätzlich werden Referenz- und Hinweis-Spalten ausgewählt, um pro Experiment einen zweiten LLM-Call für Abweichungen zwischen Spalten auszuführen.
- Im Folgeschritt wählt der/die Nutzer:in Referenzspalten, das LLM gleicht Abweichungen dagegen ab und kennzeichnet Experimente als repräsentativ oder nicht (mit Rationale im Audit-Log).
- Der bisherige Grouping-Schritt entfällt; UI und Navigation müssen die neuen Schritte sichtbar machen (Stepper ggf. anpassen).

### LLM-Abweichungsanalyse (Schritt 3)
- Auswahl: Kommentarspalten (potenzielle Abweichungen) und relevante Kontextspalten (z.B. Temperatur, Edukte, Additive, Lösemittel).
- Verarbeitung: GPT-5 mini (Snapshot 2025-08-07; Fallback gpt-5-mini) liest pro Experiment die Kommentarspalten, klassifiziert höchstens in die folgenden 13 Ontologie-Kategorien (keine weitere erlaubt) und liefert die Original-Textstelle:
- Leere Kommentarspalten: Wenn in den gewählten Kommentarspalten keine Textstellen vorhanden sind, wird der Lauf als „keine Auffälligkeiten“ markiert und es wird kein LLM-Aufruf ausgelöst.
  1. Apparatur- oder Anlagenprobleme
  2. Abweichender Dosier- oder Zugabemodus
  3. Temperatur- oder Druckinstabilität
  4. Geänderte Reihenfolge oder veränderter Ablauf
  5. Probleme mit Materialqualität oder Verunreinigungen
  6. Unerwartete Ereignisse oder Zwischenfälle
  7. Explizite Warnungen oder Einschränkungen
  8. Geänderter Aufarbeitungs- oder Isolationsschritt
  9. Probleme bei Analytik oder Probenahme
  10. Explizite Angabe zentraler Versuchsparameter im Kommentar
  11. Widersprüchliche Parameterangabe
  12. Abweichende Stoffidentität oder Charge
  13. Abweichende Reaktionsbedingungen
- Ausgabe (JSON-only, keine Bewertungen/Korrekturvorschläge):
  ```json
  {
    "experimentId": "exp-123",
    "experimentName": "Experiment A",
    "model": "gpt-5-mini-2025-08-07" | "gpt-5-mini",
    "status": "findings | no_findings",
    "findings": [
      {
        "category": "<one of the 13 ids>",
        "snippet": "exakte Textstelle aus der Kommentarspalte",
        "sourceColumn": "Kommentar",
        "note": "optional, kurz"
      }
    ],
    "usedColumns": {
      "deviation": ["Kommentar"],
      "parameters": ["Temperatur", "Lösemittel"]
    },
    "requestId": "req-abc"
  }
  ```
- UI: sichtbare LLM-Kennzeichnung („LLM · GPT-5 mini-2025-08-07 · Fallback gpt-5-mini“), Filter „Nur Versuche mit Auffälligkeiten“ sowie Ontologie-Filter pro Kategorie.

### LLM-Spalten-Abgleich (Schritt 3b)
- Auswahl: Referenzspalten (strukturierte Parameter) und Hinweis-/Kommentarspalten (Freitext).
- Verarbeitung: Zweiter LLM-Call pro Experiment prüft Inkonsistenzen zwischen Referenz- und Detailspalten (z.B. Edukt vs. Kommentar, Temperatur vs. Notiz).
- Ausgabe (JSON-only, keine Bewertungen/Korrekturvorschläge): identisches Schema wie oben, inkl. `findings[]` und Ontologie-IDs.

## LLM Column Scan (optional Helfer)
- Serverless Route: `api/column-scan.ts` (Node runtime) ruft `gpt-5.2` über den OpenAI Node SDK auf und liefert validiertes JSON.
- Env: `OPENAI_API_KEY` für lokalen Betrieb und Vercel.
- Request (POST `/api/column-scan`): columns-Array (name, typeHeuristic, nonNullRatio, examples), optional `experimentCount`, `knownStructuralColumns`, `includeComments`.
- Response (200): `{ ok: true, requestId, result: { selectedColumns, columnRoles, factorCandidates, notes, uncertainties } }` mit strengen Limits.
- UI: Im Abweichungs-/Repräsentativitäts-Bereich als “Column scan” Panel: Request zusammenstellen, `includeComments` toggeln, Vorschläge prüfen und manuell verfeinern.

### LLM Deviation Scan API
- Route: `api/deviation-scan.ts` (Node runtime) ruft bevorzugt **gpt-5-mini-2025-08-07** auf; Fallback **gpt-5-mini**.
- Request (POST `/api/deviation-scan`): `experimentId`, `experimentName`, `deviationColumns[{ column, snippets[] }]`, optionale `parameterColumns[{ column, values[] }]`.
- Response (200): `{ ok: true, requestId, result: { experimentId, model: "gpt-5-mini-2025-08-07" | "gpt-5-mini", status, findings[] } }` oder Fehlerobjekt inkl. Debug-Prompt.

### LLM Consistency Scan API
- Route: `api/deviation-consistency.ts` (Node runtime) ruft bevorzugt **gpt-5-mini-2025-08-07** auf; Fallback **gpt-5-mini**.
- Request (POST `/api/deviation-consistency`): `experimentId`, `experimentName`, `referenceColumns[{ column, values[] }]`, `detailColumns[{ column, snippets[] }]`.
- Response (200): `{ ok: true, requestId, result: { experimentId, model: "gpt-5-mini-2025-08-07" | "gpt-5-mini", status, findings[] } }` oder Fehlerobjekt inkl. Debug-Prompt.
