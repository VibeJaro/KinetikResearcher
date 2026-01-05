# KinetikResearcher

Ein geführter Kinetik-Assistent für Chemiker:innen und Ingenieur:innen, die schnell und sicher durch Datenimport, Validierung, Modellierung und Reporting kommen wollen – ohne Kinetik-Expert:in sein zu müssen.

## Was die App bietet
- **Geführter Flow**: Import & Mapping → Validation → Abweichungen (LLM-unterstützt, Kommentarspalten) → Repräsentativitäts-Check (LLM-Abgleich mit gewählten Spalten) → Modeling/Fit → Report/Export (LLM-unterstützt).
- **Geführte UX**: verständliche Texte, empfohlene Defaults, “Warum?”-Tooltips und Undo-freundliche Aktionen.
- **Validierung auf Deutsch**: Serien-Kacheln mit Mini-Plots (Punkte + Linie), klare Kurztexte und Handlungsempfehlungen, damit auch nicht-expertische Nutzer:innen schnell entscheiden können.
- **Auditierbar**: Jede Annahme und Antwort landet im Audit-Log, ohne die vorhandenen Funktionen einzuschränken.
- **Deterministischer Kern**: Fitting, Einheiten, Plots laufen als Code; LLM nur für Hinweise, Fragen, Textbausteine.

## Design-Referenz
Das App-Layout folgt dem UI-Design-Draft unter `design/kinetik-researcher.design-draft.html` (Design-Vertrag, kein Produktionscode). Öffne die Datei im Browser, um das neue End-to-End-UI zu sehen. Implementierungen in `app/` sollen die dortige Informationsarchitektur und Kerninteraktionen funktional widerspiegeln:
 - Sticky Header mit Nutzer-Badge
 - Horizontaler Stepper mit Fortschrittsbalken (5 oder 6 Schritte je nach Darstellung von Abweichung + Repräsentativitäts-Check)
 - Card-basierte Screens im mittig ausgerichteten Container

### Screens aus dem Draft (verbindliche UX-Elemente)
- **Import**: Drag-and-Drop Upload-Zone; danach Mapping-Card mit Dropdowns und CTA „Weiter zur Validierung“. Das UI wurde bereits auf das neue Draft-Layout gehoben (Header-Badge, horizontaler Stepper, Cards). Werte-Spalten lassen sich per Mehrfachauswahl im Dropdown setzen, die Replicate-Auswahl ist entfallen, und sobald eine Experiment-Spalte gewählt ist, zeigt die Vorschau direkt die ersten 20 Experimente (jeweils erste Zeile).
- **Validation**: Serien-Kacheln mit Dauer/Point-Count, Mini-Plots (Punkte + Linie) für den Schnellcheck, deutschsprachige Hinweise (Status-Pill + Technische Details) und CTA-Leiste „Zurück/Weiter“ unten.
- **Abweichungen (LLM)**: Neuer Schritt statt Grouping. Nutzer:innen wählen eine oder mehrere Kommentarspalten, das LLM liest die Einträge pro Experiment und markiert potenzielle Abweichungen (Kategorien folgen). Ergebnis: Abweichungs-Liste inkl. Herkunftsspalte.
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
- Nutzer:innen wählen Kommentarspalten und relevante Parameter-Spalten. Das LLM liest pro Experiment die Kommentare, erkennt nur die 10 vorgegebenen Auffälligkeiten (ohne Bewertung) und nennt die Textstelle samt Herkunftsspalte.
- Im Folgeschritt wählt der/die Nutzer:in Referenzspalten, das LLM gleicht Abweichungen dagegen ab und kennzeichnet Experimente als repräsentativ oder nicht (mit Rationale im Audit-Log).
- Der bisherige Grouping-Schritt entfällt; UI und Navigation zeigen stattdessen den Abweichungsschritt mit Filteroptionen (z. B. „nur Versuche ohne Auffälligkeiten“ oder „mit Dosierabweichung“).

## LLM Column Scan (optional Helfer)
- Serverless Route: `api/column-scan.ts` (Node runtime) ruft `gpt-5.2` über den OpenAI Node SDK auf und liefert validiertes JSON.
- Env: `OPENAI_API_KEY` für lokalen Betrieb und Vercel.
- Request (POST `/api/column-scan`): columns-Array (name, typeHeuristic, nonNullRatio, examples), optional `experimentCount`, `knownStructuralColumns`, `includeComments`.
- Response (200): `{ ok: true, requestId, result: { selectedColumns, columnRoles, factorCandidates, notes, uncertainties } }` mit strengen Limits.
- UI: Im Abweichungs-/Repräsentativitäts-Bereich als “Column scan” Panel: Request zusammenstellen, `includeComments` toggeln, Vorschläge prüfen und manuell verfeinern.
