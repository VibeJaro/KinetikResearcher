# KinetikResearcher

Ein geführter Kinetik-Assistent für Chemiker:innen und Ingenieur:innen, die schnell und sicher durch Datenimport, Validierung, Modellierung und Reporting kommen wollen – ohne Kinetik-Expert:in sein zu müssen.

## Was die App bietet
- **Klarer 5-Schritte-Flow**: Import & Mapping → Validation → Grouping (LLM-unterstützt) → Modeling/Fit → Report/Export (LLM-unterstützt).
- **Geführte UX**: verständliche Texte, empfohlene Defaults, “Warum?”-Tooltips und Undo-freundliche Aktionen.
- **Auditierbar**: Jede Annahme und Antwort landet im Audit-Log, ohne die vorhandenen Funktionen einzuschränken.
- **Deterministischer Kern**: Fitting, Einheiten, Plots laufen als Code; LLM nur für Hinweise, Fragen, Textbausteine.

## Design-Referenz
Das App-Layout folgt dem UI-Design-Draft unter `design/kinetik-researcher.design-draft.html` (Design-Vertrag, kein Produktionscode). Öffne die Datei im Browser, um das neue End-to-End-UI zu sehen. Implementierungen in `app/` sollen die dortige Informationsarchitektur und Kerninteraktionen funktional widerspiegeln:
- Sticky Header mit Nutzer-Badge
- Horizontaler 5-Schritte-Stepper mit Fortschrittsbalken
- Card-basierte Screens im mittig ausgerichteten Container

### Screens aus dem Draft (verbindliche UX-Elemente)
- **Import**: Drag-and-Drop Upload-Zone; danach Mapping-Card mit Dropdowns und CTA „Weiter zur Validierung“. Das UI wurde bereits auf das neue Draft-Layout gehoben (Header-Badge, horizontaler Stepper, Cards).
- **Validation**: Checkliste mit Badge-Status (Laden/OK), KI-Hinweisbox und CTA-Leiste „Zurück/Abschließen“ unten.
- **Grouping**: Grid aus farbmarkierten Group-Cards, „Neue Gruppe +“-Button, klarer „Bestätigen“-CTA.
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

### Grouping (LLM-unterstützt)
- Ziel: Echte Labordaten sind messy. Das LLM bekommt alle Spaltennamen und unique Values, schlägt Gruppierungen/Experimente vor (z.B. Additiv, Temperaturrampe, anderes Edukt) und hilft, Serien sinnvoll zu bündeln. Vorschläge lassen sich manuell anpassen; jede Entscheidung geht ins Audit-Log.

## LLM Column Scan (optional Helfer)
- Serverless Route: `api/column-scan.ts` (Node runtime) ruft `gpt-5.2` über den OpenAI Node SDK auf und liefert validiertes JSON.
- Env: `OPENAI_API_KEY` für lokalen Betrieb und Vercel.
- Request (POST `/api/column-scan`): columns-Array (name, typeHeuristic, nonNullRatio, examples), optional `experimentCount`, `knownStructuralColumns`, `includeComments`.
- Response (200): `{ ok: true, requestId, result: { selectedColumns, columnRoles, factorCandidates, notes, uncertainties } }` mit strengen Limits.
- UI: Im Grouping-Screen als “Column scan” Panel: Request zusammenstellen, `includeComments` toggeln, Vorschläge prüfen und manuell verfeinern.
