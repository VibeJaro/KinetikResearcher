# KinetikResearcher

Ein geführter Kinetik-Assistent für Chemiker:innen und Ingenieur:innen, die schnell und sicher durch Datenimport, Validierung, Modellierung und Reporting kommen wollen – ohne Kinetik-Expert:in sein zu müssen.

## Was die App bietet
- **Klarer 5-Schritte-Flow**: Import & Mapping → Validation → Grouping (LLM-unterstützt) → Modeling/Fit → Report/Export (LLM-unterstützt).
- **Geführte UX**: verständliche Texte, empfohlene Defaults, “Warum?”-Tooltips und Undo-freundliche Aktionen.
- **Auditierbar**: Jede Annahme und Antwort landet im Audit-Log, ohne die vorhandenen Funktionen einzuschränken.
- **Deterministischer Kern**: Fitting, Einheiten, Plots laufen als Code; LLM nur für Hinweise, Fragen, Textbausteine.

## Design-Referenz
Das App-Layout folgt dem UI-Design-Draft unter `design/kinetik-researcher.design-draft.html` (Design-Vertrag, kein Produktionscode). Implementierungen in `app/` sollen die dortige Informationsarchitektur und Kerninteraktionen funktional widerspiegeln.

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
