# agents.md — Kinetik-App (Kinetik Researcher)

Diese Datei ist die Leitplanke für alle Agenten-/Codex-Arbeiten an der Kinetik-App. Ziel: sauber, reproduzierbar, auditierbar, wissenschaftlich belastbar. Lieber weniger “Magie”, mehr Nachvollziehbarkeit.

---

## 0) Produktziel in einem Satz
Eine App, die kinetische Experimente (Zeitreihen + Metadaten) Schritt für Schritt durch Import → Validierung → Rückfragen (human-in-the-loop) → Modellierung/Fit → Diagnose → Report führt – mit lückenlosem Audit-Log, sodass Entscheidungen und Annahmen nachvollziehbar bleiben.

---

## 1) Design-Draft ist vorhanden (WICHTIG)

### 1.1 Quelle des UI-Zielbilds
Im Repository liegt ein **UI-Design-Draft als HTML-Datei** unter:
- `design/kinetik-researcher.design-draft.html`

Dieser Draft ist **Referenz** für Layout, Informationsarchitektur und UI-Komponenten.

### 1.2 Regeln für den Draft
- Der Draft ist **kein** Produktionscode. Er bleibt framework-frei und dient als “Design Contract”.
- Änderungen am Draft passieren nur bewusst (z.B. wenn UI-Entscheidungen reifen).
- Implementierung in `app/` muss den Draft **funktional** nachbilden (nicht pixel-perfect, aber strukturell erkennbar: Bereiche, Navigation, Kerninteraktionen).

### 1.3 UI-Sync-Workflow
Bei jedem größeren UI-Feature:
- Prüfe: Entspricht das Verhalten/Screen dem Draft?
- Wenn nicht: entweder Implementierung anpassen **oder** Draft aktualisieren.
- Wichtige UI-Entscheidungen werden als ADR dokumentiert (siehe /docs/adr).

---

## 2) Kernprinzipien (nicht verhandelbar)

### 2.1 Reproduzierbarkeit > “sieht gut aus”
- Jede Auswertung muss mit denselben Inputs reproduzierbar sein.
- Keine stillen Annahmen: Wenn etwas angenommen wird (Einheit, Nullpunkt, Konzentrationsbasis, etc.), muss es im Audit-Log stehen.

### 2.2 Deterministisch rechnen, LLM nur fürs Denken/Fragen
- Alles, was regelbasiert oder mathematisch berechenbar ist, wird **nicht** vom LLM “ausgerechnet”.
- LLM/Agent nutzt man für:
  - Interpretation von Datenproblemen
  - Hypothesen/Checks vorschlagen
  - Rückfragen und Antwortoptionen erzeugen
  - Zusammenfassungen/Report-Text
- Fit/Statistik/Plots/Unit-Konvertierung sind deterministischer Code.

### 2.3 Human-in-the-loop als Feature, nicht als Bug
- Wenn Daten unklar sind, wird nicht geraten, sondern gefragt.
- Rückfragen sind strukturiert (Buttons/Optionen), Freitext ist optional.
- Jede Nutzerantwort erzeugt eine “Decision” im Audit-Log.

### 2.4 Wissenschaftliche Hygiene
- Keine “best fit”-Euphorie: Modelle werden diagnostiziert (Residuen, Parameter-Korrelation, Konfidenzintervalle, AIC/BIC).
- Warnungen/Flags sind normal, nicht peinlich. UI soll Flags sichtbar machen.

### 2.5 Keine Daten zerstören
- Rohdaten bleiben roh (immutable).
- Korrekturen/Transformationen sind abgeleitet und versioniert.

---

## 3) Arbeitsmodus für Codex/Agenten

### 3.1 Kleine Scheiben liefern
- Implementiere Features in kleinen, testbaren Schritten.
- Jede PR/Änderung enthält:
  - klare Beschreibung
  - Tests (unit + ggf. Golden Dataset)
  - falls UI betroffen: kurze Notiz, welche Draft-Komponente umgesetzt wurde

### 3.2 “Definition of Done” (DoD) gilt immer
Ein Feature gilt als fertig, wenn:
- Akzeptanzkriterien erfüllt
- Tests grün
- Audit-Log korrekt
- Keine stillen Annahmen
- Edge Cases dokumentiert (mindestens die wichtigsten)

### 3.3 Keine Refactor-Orgie ohne Grund
- Refactor nur, wenn es unmittelbar ein Feature oder Bugfix ermöglicht.
- Große Umbauten müssen als eigenes Epic/Issue begründet sein.

---

## 4) Architektur (High-Level)

### 4.1 Zielarchitektur: Hybrid
- Frontend: UI, Interaktionen, Visualisierung, lokales State-Management
- Domain/Core: Datenmodell, Validation, Fit-Engine, Report-Generator (deterministisch)
- Agent Layer: Orchestriert Fragen/Hypothesen/Next Steps, schreibt Decisions ins Log
- Storage: lokal (IndexedDB) + Export/Import; optional später Backend

### 4.2 Keine Backend-Pflicht im PoC
- Start: komplett lokal im Browser möglich.
- Optional später: Server für Team-Sharing, Permissions, große Dateien, zentrale LLM-Policy.

---

## 5) Tech Stack (empfohlen, kann angepasst werden)

### 5.1 Frontend
- TypeScript (strict)
- React + Vite (Standard) oder Next.js (optional)
- State: Zustand (leicht) oder Redux Toolkit
- Plotting: Plotly.js oder ECharts

### 5.2 Compute / Fitting
- Deterministische Fit-Engine (JS/TS)
- Später optional: Backend/Python, aber nicht für den Start nötig.

### 5.3 LLM/Agent
- Tool-Wrapper: klar definierte “Functions”/Tools (siehe Abschnitt 9)
- Keine LLM-Ausgaben direkt als Wahrheit übernehmen.

---

## 6) Repo-Struktur (aktualisiert)

/agents.md

/design
kinetik-researcher.design-draft.html
README.md (optional)

/app
/src
/ui
/features
/import
/validation
/elicitation
/modeling
/diagnostics
/report
/core
/domain
/units
/validation
/modeling
/reporting
/audit
/datasets
/agent
/prompts
/orchestrator
/tools
/tests

/docs
/specs
/adr

---

## 7) Domain Model (konzeptionell)

### 7.1 Kernobjekte
- Project, Dataset, Experiment, Timeseries, DerivedSeries
- Flag (info/warn/error)
- Decision (Audit)
- ModelFit (Parameter + Gütemaße + Diagnose)

---

## 8) Pipeline (Workflow in der App)
1) Import & Mapping
2) Validation (Flags)
3) Questions (Interview-Modus)
4) Modeling/Fit
5) Diagnostics/Hypotheses
6) Report/Export

Diese 6 Steps müssen im UI wiedererkennbar sein (siehe Design-Draft).

---

## 9) Tool-Schnittstellen (Agent ↔ App)
Der Agent darf nur Tools triggern, z.B.:
- getProjectState()
- runValidation(datasetId)
- applyDecision(decision)
- convertUnits(seriesId, targetUnit)
- fitModel(experimentId, modelType, settings)
- compareModels(experimentId, modelTypes[])
- generateReport(projectId, selection)

---

## 10) Tests & Qualität

### 10.1 Golden Datasets (Pflicht)
Kleine kuratierte Datensätze:
- golden_first_order_clean
- golden_deactivation_signal
- golden_consecutive_A_B_C
- golden_units_messy
- golden_sampling_sparse

### 10.2 Testarten
- Unit: units parsing, validation checks, fit routines
- Regression: Golden datasets

---

## 11) Logging, Audit, Provenance

Audit-Log muss enthalten:
- timestamp, actor (user|agent|system), action
- rationale
- references
- before/after bei Transformationen

Import-Dateien erhalten Hash (z.B. SHA-256). DerivedSeries referenziert Rohdatenhash + Transformationsparameter.

---

## 12) Security / IP (Minimalstandard)
- Keine Daten an externe Dienste ohne Opt-in.
- Wenn LLM extern: Default redacted/local-only.
- Logs ohne unnötige personenbezogene Daten.

---

## 13) Umsetzungsreihenfolge (Startplan, kompatibel mit Design-Draft)
1) App-Skeleton + Layout wie Draft (Header/Sidebar/Main/Right Panel)
2) Fake-Daten-Integration in echter App (nur zur UI-Parität)
3) CSV Import + Column Mapping
4) Validation Engine v1 + Flags UI
5) Audit-Log v1 (Decisions + Anzeige)
6) Questions UI + applyDecision
7) Modeling v1 (1. Ordnung) + Diagnoseplots Placeholder
8) Report v1 (Markdown Preview + Export Dummy)

---

## 14) Globale Akzeptanzkriterien
- Kein Feature ohne Tests.
- Keine Transformation ohne Audit-Eintrag.
- Keine Einheit ohne Parser + explizite Darstellung.
- Keine “magischen” LLM-Behauptungen ohne Evidenz/Flags.

---

