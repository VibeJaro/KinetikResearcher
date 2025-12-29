# agents.md — Kinetik-App (Kinetik Researcher)

Leitplanken für alle Arbeiten an der Kinetik-App. Ziel: eine **klar geführte UX für nicht-expertische Chemiker:innen und Ingenieur:innen**, die schnelle, nachvollziehbare Kinetik-Unterstützung brauchen. Weniger Jargon, mehr Orientierung, ohne die wissenschaftliche Belastbarkeit zu verlieren.

---

## 0) Produktziel & Zielgruppe
Eine App, die Projektchemiker:innen und Ingenieur:innen Schritt für Schritt durch Import → Validierung → Rückfragen (human-in-the-loop) → Modellierung/Fit → Diagnose → Report führt. Jede Entscheidung bleibt auditierbar, aber die Bedienung fühlt sich wie ein gut geführter Assistent an: klare Hinweise, sichere Defaults, kein Fachchinesisch nötig.

---

## 1) Persona & UX-Modus
- Typische Nutzer:innen: Projektchemiker:innen, Prozessingenieur:innen, Laborleitungen mit wenig Zeit und begrenztem Kinetik-Spezialwissen.
- UX-Prinzipien:
  - **Geführter Happy Path**: Default-Flows pro Schritt, mit sichtbaren Nächste-Schritte-Hinweisen.
  - **Klare Sprache**: kurze Texte, bekannte Begriffe, Beispiele statt Formeln, wo möglich.
  - **Safety by Design**: sichere Voreinstellungen, Warnungen früh und sichtbar, Undo statt Blocker.
  - **Progressive Disclosure**: Details/Parameter erst zeigen, wenn nötig; “Warum?”-Tooltips für Hintergründe.
  - **Kein Rätselraten**: immer anzeigen, was als Nächstes erwartet wird und warum ein Feld wichtig ist.

---

## 2) Design-Draft (WICHTIG)
- Referenz & Vorschau: `design/kinetik-researcher.design-draft.html` (UI/UX-Vertrag). Im Browser öffnen, um das neue End-to-End-Layout zu sehen.
- Neues UI/UX-Grundgerüst: Sticky Header mit Nutzer-Badge, horizontaler 5-Schritte-Stepper mit Fortschrittsbalken, card-basierte Screens im mittig ausgerichteten Container.
- Step-Spezifika aus dem Draft (müssen in der App erkennbar sein):
  - Import: Drag-and-Drop Upload-Zone, danach Mapping-Card mit Dropdowns und „Weiter zur Validierung“-CTA.
  - Validation: Checkliste mit Badge-Status (Laden/OK), KI-Analyse-Hinweisbox und CTA-Leiste „Zurück/Abschließen“ unten.
  - Gruppierung: Grid aus farbmarkierten Group-Cards, „Neue Gruppe +“-Button und klarer „Bestätigen“-CTA.
  - Modeling: Zweispaltig (links Fit-Parameter inkl. Arrhenius-Checkbox + R²-Summary, rechts Chart-Card mit Legende), Abschluss-CTA „Berechnen“.
  - Report: Zweispaltig (links Chat mit Quick-Replies und „Report Generieren“, rechts PDF-Preview mit Titelbar + Download-CTA).
- Implementierungen in `app/` müssen diese Layouts und Kerninteraktionen funktional widerspiegeln; visuelle Feinheiten dürfen mit Framework-Styles umgesetzt werden.
- Bei Abweichungen: Implementierung anpassen oder Draft bewusst aktualisieren. Wichtige UI-Entscheidungen als ADR dokumentieren (`/docs/adr`).

---

## 3) Workflow im UI (sichtbar und geführt)
1) **Import & Mapping** – Upload-Hinweise, Beispiel-Formate, auto-vorgeschlagene Rollen, einfache Korrekturen.
2) **Validation** – Flag-Liste mit Klartext, Prioritäten, Fix-Vorschlägen und Effekten auf spätere Schritte.
3) **Grouping (LLM-unterstützt)** – LLM erhält alle Spaltennamen und unique Values, schlägt sinnvolle Gruppierungen/Experimente vor (z.B. Additiv, Temperaturrampe, anderes Edukt). Nutzer:innen können Vorschläge annehmen/ändern; alles landet im Audit-Log.
4) **Modeling/Fit** – verständliche Presets (z.B. “einfacher 1. Ordnung Fit”), Parameter-Erklärungen, Ergebnis-Klartext.
5) **Report/Export (LLM-unterstützt)** – LLM stellt Klarstellungsfragen, prüft Missverständnisse/Unsicherheiten und erzeugt einen ausführlichen Report inkl. Grafiken; Annahmen klar markieren.

Diese 5 Schritte müssen in der Navigation erkennbar und entlang des Drafts umgesetzt sein.

---

## 4) Kernprinzipien (nicht verhandelbar)
- **Reproduzierbarkeit**: gleiche Inputs → gleiche Outputs. Keine stillen Annahmen; alles ins Audit-Log.
- **Deterministisch rechnen**: Fitting/Units/Plots sind Code, nicht LLM. LLM nur für Deutung, Fragen, Textbausteine.
- **Human-in-the-loop**: Unklare Daten? Lieber nachfragen, Optionen vorschlagen, Antwort protokollieren.
- **Keine Daten zerstören**: Rohdaten bleiben unverändert; Ableitungen versioniert.
- **Sichtbare Qualität**: Flags, Konfidenzintervalle, AIC/BIC, Parameter-Korrelationen müssen zugänglich und verständlich sein.

---

## 5) Sprache & UX-Kleinigkeiten
- Text kurz, aktiv, ohne Spezialjargon. Falls Fachbegriff nötig: kurzer Hint/Tooltip.
- Prefer Buttons/Options statt Freitext; Defaults immer nennen (“Empfohlen für typische Labor-Run…”).
- Fehlermeldungen enthalten: was passiert, warum es wichtig ist, wie man es behebt.
- Audit-Hinweise in Klartext (“Du hast X angenommen → wirkt auf Y”).

---

## 6) Arbeitsmodus für Codex/Agenten
- **Kleine Scheiben**: kleine, testbare Schritte mit klarer Beschreibung.
- **DoD**: Akzeptanzkriterien erfüllt, Tests grün, Audit-Log korrekt, keine stillen Annahmen, wichtigste Edge Cases dokumentiert.
- **Refactor mit Ziel**: nur wenn es Feature/Bugfix unmittelbar ermöglicht; große Umbauten separat begründen.

---

## 7) Architektur (High-Level)
- Hybrid: Frontend (UI & State), Domain/Core (Validation, Fit, Report), Agent Layer (Fragen/Next Steps/Audit), Storage lokal (IndexedDB) + Export/Import; später optional Backend.
- PoC bleibt lokal lauffähig; Server erst bei Sharing/Policies nötig.

---

## 8) Tech Stack (empfohlen)
- Frontend: TypeScript (strict), React + Vite (Standard) oder Next.js (optional); State: Zustand oder Redux Toolkit; Plotting: Plotly.js oder ECharts.
- Compute/Fitting: deterministische Fit-Engine (JS/TS); optional später Backend/Python.
- LLM/Agent: klar definierte Tools (siehe Abschnitt 10); LLM-Ausgaben nie ungeprüft übernehmen.

---

## 9) Repo-Struktur (Kurzform)
/agents.md

/design
- kinetik-researcher.design-draft.html

/app
- src/ui/features/import/validation/elicitation/modeling/diagnostics/report/…
- core/domain/units/validation/modeling/reporting/audit/datasets/agent/prompts/orchestrator/tools/tests

/docs (specs, adr)

---

## 10) Tool-Schnittstellen (Agent ↔ App)
Zulässige Agent-Calls (Beispiele):
- getProjectState()
- runValidation(datasetId)
- applyDecision(decision)
- convertUnits(seriesId, targetUnit)
- fitModel(experimentId, modelType, settings)
- compareModels(experimentId, modelTypes[])
- generateReport(projectId, selection)

---

## 11) Tests & Qualität
- Golden Datasets nutzen (z.B. golden_first_order_clean, golden_deactivation_signal, golden_consecutive_A_B_C, golden_units_messy, golden_sampling_sparse).
- Testarten: Unit (Units-Parsing, Validation-Checks, Fit-Routinen), Regression (Golden Datasets).

---

## 12) Logging, Audit, Provenance
- Audit-Log: timestamp, actor (user|agent|system), action, rationale, references, before/after bei Transformationen.
- Import-Dateien: Hash (z.B. SHA-256). DerivedSeries referenzieren Rohdaten-Hash + Transformationsparameter.

---

## 13) Security / IP (Minimalstandard)
- Keine Daten an externe Dienste ohne Opt-in.
- Externe LLM: Default redacted/local-only.
- Logs ohne unnötige personenbezogene Daten.

---

## 14) Umsetzungsreihenfolge (kompatibel mit Draft)
1) App-Skeleton + Layout wie Draft (Header/Sidebar/Main/Right Panel)
2) Fake-Daten in echter App zur UI-Parität
3) CSV Import + Column Mapping
4) Validation Engine v1 + Flags UI
5) Audit-Log v1 (Decisions + Anzeige)
6) Questions UI + applyDecision
7) Modeling v1 (1. Ordnung) + Diagnoseplots Placeholder
8) Report v1 (Markdown Preview + Export Dummy)

---

## 15) Globale Akzeptanzkriterien
- Kein Feature ohne Tests.
- Keine Transformation ohne Audit-Eintrag.
- Keine Einheit ohne Parser + explizite Darstellung.
- Keine “magischen” LLM-Behauptungen ohne Evidenz/Flags.
