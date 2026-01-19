# Konzept: Modeling in der KinetikResearcher-App

## 1) Zielbild & Leitplanken
Dieses Konzept beschreibt, wie das **Modeling/Fit** in der App ablaufen soll: agentenunterstützt, aber **deterministisch, transparent und human‑in‑the‑loop**. Es orientiert sich am Produktziel der App (geführter Flow, auditierbar, deterministischer Kern) und an den Best Practices aus der bereitgestellten Kinetik‑Anleitung. Der Flow ist bewusst so gestaltet, dass **auch Nicht‑Expert:innen** in der Kinetik systematisch zu einem belastbaren Modell gelangen.

**Nicht verhandelbar**
- **Deterministische Rechenlogik**: ODE‑Löser, Fit‑Algorithmen, Einheiten‑Konvertierungen, Diagramme sind reine Code‑Pipelines (kein LLM‑Output als Berechnungsgrundlage).
- **Reproduzierbarkeit**: identische Inputs → identische Outputs; vollständiges Audit‑Log für Annahmen, Parameter, Daten‑Versionen, Entscheidungen.
- **Human‑in‑the‑loop**: kritische Entscheidungen (Modellwahl, Deaktivierung, Datenexklusion, Fixierung/Bounds) werden als Entscheidungspunkte explizit abgefragt.
- **Verständlichkeit für Nicht‑Expert:innen**: jeder Schritt erklärt „Warum?“ und „Was heißt das?“, mit klaren Optionen statt Fachjargon.
- **LLM nur als Erklär‑ und Navigationshilfe**: LLM‑Hinweise unterstützen Entscheidungen, rechnen aber nie.

## 2) Kern-Idee: Agent orchestriert nur validierte, deterministische Skripte
Der Agent agiert als **Orchestrator**, nicht als Recheninstanz. Er darf **ausschließlich definierte, validierte Skripte** aufrufen, die deterministisch sind und strikt versioniert/protokolliert werden.

**Prinzipien**
- **Skript‑Registry**: Nur freigegebene Skripte (z. B. `fit_model_v1`, `compare_models_v1`) mit festem JSON‑Schema und statischer Validierung.
- **Input‑Validierung**: Units, Parameter‑Bounds, Datensatz‑IDs und Modell‑Typen werden vor Lauf geprüft.
- **Audit‑Log‑Eintrag**: Jeder Skript‑Call erzeugt einen Eintrag mit Hashes, Parametern, Ergebnissen, Versionen.
- **Deterministische Seeds**: Falls Stochastik (z. B. Multi‑Start) nötig ist, sind Seeds Pflicht und werden geloggt.
- **LLM‑Assistenz in Klartext**: Erklärt Ergebnisse, schlägt nächste Schritte vor und formuliert Rückfragen, aber verändert keine Daten oder Modelle.

## 3) Modeling‑Pipeline (End‑to‑End)
Die Pipeline folgt den Best Practices der Kinetik‑Anleitung (Daten/Netzwerk verstehen → Modellansatz wählen → Parameter schätzen → Validierung/Diagnostik → Vergleich). Das Ergebnis ist ein **nachvollziehbares, schrittweise begründetes Modell**.

### 3.1 Preflight: Daten & Reaktionsnetzwerk verstehen
**Zweck**: Sicherstellen, dass das Reaktionsnetzwerk und die Daten valide sind.

**Checkliste (deterministisch)**
1. **Netzwerk‑Vollständigkeit**: Sind alle relevanten Edukte/Produkte/Nebenprodukte enthalten? (Fehlende Reaktionen → Warnung + Rückfrage an Nutzer:in.)
2. **Stöchiometrie & Massenbilanzen**: Plausibilitätsprüfung auf Massen‑/Elementbilanzen.
3. **Datenqualität**: Inkonsistenzen, Ausreißer, fehlende Einheiten, Messrauschen.
4. **Betriebsbedingungen**: Isotherm? Durchmischung? Hinweise auf Transport‑Limitierung?

**Human‑in‑the‑loop‑Gate**: Netzwerklücken/fehlende Spezies/inkonsistente Stöchiometrie müssen bestätigt und korrigiert werden, bevor Modeling gestartet wird.
**LLM‑Unterstützung**: Kurz erklärt, was die Warnungen bedeuten, und stellt gezielte Rückfragen („Fehlt ein Nebenprodukt?“).

### 3.2 Modellkandidaten generieren (mehrere Varianten)
**Zweck**: Mehrere plausible Modellfamilien bilden, die später objektiv verglichen werden.

**Kandidaten‑Familien** (aus der Kinetik‑Anleitung abgeleitet):
- **Massenwirkungsgesetz / elementare Reaktionen** (mechanistisch, wenn Mechanismus klar).
- **Empirische Rategesetze** (Potenzgesetze), wenn Mechanismus unklar.
- **LHHW‑Modelle** (heterogene Katalyse mit Adsorption/Inhibition).
- **Reversible Reaktionen** (Rückreaktionen/Equilibrium‑Konstanten).
- **Inhibition/Hemmung** (Produkt‑/Nebenprodukt‑Inhibition).
- **Katalysator‑Deaktivierung** (Aktivitätsfaktor a(t), selektiv vs. nicht‑selektiv).

**Kandidaten‑Strategie**
- Für jede Reaktion wird eine **kleine, priorisierte Kandidatenliste** erstellt (max. 3–5), um Überfitting zu vermeiden.
- Kandidaten werden **nach Plausibilität** (Chemie) und **Parameter‑Ökonomie** sortiert.

**Human‑in‑the‑loop‑Gate**: Nutzer:in bestätigt die Kandidatenliste (mit Klartext‑Begründung pro Kandidat).
**LLM‑Unterstützung**: Erklärt Unterschiede zwischen Kandidaten in Alltagssprache (z. B. „empirisch = passt Daten gut, aber weniger erklärbar“).

### 3.3 Parameter‑Schätzung (Fit)
**Zweck**: Parameter (k, Reaktionsordnungen, Aktivierungsenergien, Inhibitionsparameter, Deaktivierung) aus den Daten bestimmen.

**Deterministische Schritte**
- **Initialwerte**: Literaturwerte, heuristische Defaults, oder aus einfachen linearen Approximierungen; alles mit Quellenhinweis.
- **ODE‑System**: Automatisch aus Netzwerk + Modellgleichungen generiert; Solver‑Auswahl (stiff vs. non‑stiff) deterministisch.
- **Optimierung**: Nichtlineare Regression (Least Squares), optional robust (Huber), immer mit **Bounds**.
- **Multi‑Start**: deterministische Seeds, begrenzte Starts, um lokale Minima zu vermeiden.

**Stabilitäts‑Checks**
- Parameter‑Plausibilität (keine negativen Vorfaktoren, sinnvolle Ordnungen).
- Konvergenz‑Kriterien und Stop‑Gründe im Audit‑Log.
**LLM‑Unterstützung**: Fasst zusammen, ob der Fit stabil ist und welche Parameter unplausibel wirken könnten.

### 3.4 Diagnostik & Validierung
**Zweck**: Überfitting vermeiden, Modellgüte belegen, Fehlstellen erkennen.

**Checks (deterministisch, vollständig reportet)**
- **Residuenanalyse**: Zufälligkeit vs. Trends (z. B. systematische Abweichungen zu Beginn/Ende).
- **Fit‑Güte**: R², RMSE, gewichtete Fehlermaße.
- **Parameter‑Unsicherheit**: Konfidenzintervalle; identifizierbare Parameter markieren.
- **Extrapolations‑Warnung**: Hinweis bei Vorhersage außerhalb des Datenbereichs.

**Human‑in‑the‑loop‑Gate**: Nutzer:in bestätigt, ob Modellqualität „gut genug“ ist oder alternative Modellfamilie ausprobiert werden soll.
**LLM‑Unterstützung**: Erklärt typische Residuen‑Muster (z. B. „systematischer Trend = fehlender Effekt“).

### 3.5 Modellvergleich & Auswahl
**Zweck**: Mehrere plausible Modelle objektiv vergleichen.

**Vergleichskriterien**
- **Statistisch**: AIC/BIC, F‑Tests, Cross‑Validation (falls möglich).
- **Chemisch**: Plausibilität, Konsistenz mit bekannten Mechanismen, minimale Komplexität (Occam).

**Ergebnis**: Auswahl eines „besten“ Modells + 1–2 Alternativen als Vergleichsreferenz.
**LLM‑Unterstützung**: Formuliert eine kurze Empfehlung in Klartext und weist auf Risiken hin.

## 4) Spezielle Themen (aus der Kinetik‑Anleitung, erweitert)
### 4.1 Katalysator‑Deaktivierung
**Optionen**
- **Zeitabhängig**: a(t) = exp(‑k_d·t) oder a(t) = (1 + b·t)^(‑n).
- **Belag-/Koksabhängig**: a = f(Coke) mit dynamischer Gleichung für Coke.
- **Selektiv**: Deaktivierung abhängig von bestimmten Spezies/Teilreaktionen.

**Workflow‑Implikation**
- Frühe Daten → Kinetikparameter; spätere Daten → Deaktivierungsparameter (entkoppelte Fits, wenn möglich).
- Nutzer:in bestätigt, ob Deaktivierung aufgenommen wird und welche Form gewählt wird.

### 4.2 Transport‑Limitierungen
Falls Daten Hinweise auf externe/interne Diffusionshemmung geben, wird der Fit **gesperrt** oder mit klarer Warnung versehen (Daten repräsentieren nicht die intrinsische Kinetik).

### 4.3 Temperatur‑Abhängigkeit
- Arrhenius‑Form standardmäßig möglich; Extrapolation außerhalb gemessener Temperaturen erfordert Warnung + Literatur‑Backup.

### 4.4 Einheiten & Skalierung
- Konsequent einheitliche Units (z. B. mol/L, Pa/bar, m³/L) – automatische Konvertierung mit Audit‑Log.

## 5) Deterministische Skripte: Vorschlag für die Registry
Beispiel‑Schnittstellen (nur diese dürfen vom Agenten genutzt werden):

1. `validate_modeling_inputs(datasetId, reactionNetworkId)`
2. `generate_model_candidates(reactionNetworkId, options)`
3. `fit_model(experimentId, modelSpec, fitSettings)`
4. `fit_model_multistart(experimentId, modelSpec, fitSettings, seeds[])`
5. `compare_models(experimentId, modelSpecs[], metrics[])`
6. `diagnostics_report(fitId)`
7. `export_model_report(projectId, selection)`

Jedes Skript:
- **Versioniert** (`fit_model_v1`, `fit_model_v2`)
- **Schema‑validiert** (z. B. Zod/JSON Schema)
- **Ergebnis‑Hash** + Audit‑Log‑Eintrag
- **Deterministische Seeds** für alle stochastic steps

## 6) Human‑in‑the‑loop: Entscheidungsstellen
1. **Netzwerk‑Vollständigkeit**: Reaktionsnetzwerk akzeptieren/erweitern.
2. **Modellfamilie**: Kandidaten bestätigen/ablehnen.
3. **Parameter‑Bounds/Startwerte**: Anpassungen zulassen oder Defaults akzeptieren.
4. **Deaktivierung**: ja/nein + Modellform.
5. **Modellevaluation**: Fit akzeptieren oder alternative Kandidaten rechnen.
6. **Export**: Report finalisieren (inkl. Annahmen und Unsicherheiten).

## 7) Alternativen & Trade‑offs (bewusst vergleichend)
**A) Mechanistisch vs. empirisch**
- Mechanistisch: höhere Übertragbarkeit, benötigt mehr Strukturwissen.
- Empirisch: schneller Fit, geringere Erklärbarkeit, höheres Overfitting‑Risiko.

**B) Global‑Fit vs. pro‑Experiment‑Fit**
- Global: konsistente Parameter, bessere Extrapolation, höhere Komplexität.
- Pro‑Experiment: schneller, aber weniger generalisierbar.

**C) Single‑Start vs. Multi‑Start**
- Single‑Start: deterministisch, aber Risiko lokaler Minima.
- Multi‑Start: robust, aber rechenintensiver (Seeds zwingend).

**D) LHHW vs. Massenwirkung**
- LHHW: benötigt Adsorptionsdaten, besser bei heterogener Katalyse.
- Massenwirkung: einfacher, aber evtl. unzureichend bei Oberflächenreaktionen.

## 8) Transparenz & Nachvollziehbarkeit
- Jede Annahme, jeder Fix (z. B. Fixierung von Reaktionsordnung), jede Datenfilterung wird protokolliert.
- Reports enthalten Gleichungen, Parameter mit Einheiten, Unsicherheiten, Fit‑Güte, Warnungen.
- Nutzer:innen sehen immer, **warum** ein Modell gewählt wurde (statistische + chemische Begründung).
- Zusätzlich werden LLM‑Hinweise als „Erklärungstexte“ gekennzeichnet und sind nicht Teil der Berechnung.

## 9) Erwartete Outputs pro Modelllauf
- **Modell‑Spezifikation** (Gleichungen, Netzwerk, Parameter, Bounds)
- **Fit‑Ergebnisse** (Parameter, Unsicherheiten, Konvergenz‑Status)
- **Diagnostik‑Plots** (Konzentrationsverläufe, Residuen)
- **Vergleichstabelle** (AIC/BIC, R², Plausibilitätsflags)
- **Audit‑Log‑Einträge** (vollständig)

## 10) Offene Fragen (für spätere Iteration)
- Welche Standard‑Modelle (Templates) werden in v1 ausgeliefert?
- Wie detailliert soll die Parameter‑Identifizierbarkeit (FIM, Profile Likelihood) abgebildet werden?
- Wird ein globaler Fit über Experimente standardmäßig angeboten oder optional?

## 11) User‑Story: Typischer Ablauf einer Modeling‑Analyse
**Als** Projektchemiker:in  
**möchte ich** mit wenigen, klaren Entscheidungen ein belastbares Kinetik‑Modell erstellen,  
**damit** ich schnell ein plausibles, nachvollziehbares Modell für Auslegung und Optimierung bekomme.

**Ablauf (Beispiel)**  
1. **Start im Modeling‑Schritt**: Ich sehe, welche Experimente aus Schritt 3 für das Fitting ausgewählt wurden und welche Parameter‑/Kommentarspalten dabei berücksichtigt werden.  
2. **Preflight‑Check**: Die App zeigt mir eine Checkliste (Netzwerk‑Vollständigkeit, Stöchiometrie, Datenqualität). Ich bestätige die Punkte oder korrigiere das Netzwerk. Ein LLM erklärt mir in Klartext, was jede Warnung bedeutet.  
3. **Kandidaten‑Auswahl**: Der Agent schlägt für jede Reaktion 2–3 Modellansätze vor (z. B. Massenwirkung, empirisch, LHHW). Ich bekomme kurze LLM‑Erklärungen und bestätige die Kandidaten.  
4. **Parameter‑Setup**: Ich sehe Startwerte/Bounds mit kurzen Begründungen (Literatur, Heuristik). Ein LLM erklärt „Was ist ein Bound?“ und ich passe bei Bedarf Grenzen an.  
5. **Model‑Fit**: Der Fit läuft deterministisch (inkl. Multi‑Start mit festen Seeds). Ergebnis: Parameter, Unsicherheiten, Konvergenz‑Status. Ein LLM fasst die Stabilität zusammen.  
6. **Diagnostik**: Ich prüfe Residuen‑Plots und Fit‑Güte. Bei systematischen Abweichungen erklärt mir ein LLM mögliche Ursachen und die nächsten Schritte.  
7. **Modellvergleich**: Die App vergleicht Kandidaten (AIC/BIC + chemische Plausibilität) und empfiehlt ein Modell. Das LLM übersetzt die Empfehlung in Klartext. Ich bestätige die Auswahl.  
8. **Output & Report**: Ich erhalte Gleichungen, Parameter mit Einheiten, Unsicherheiten, Warnungen und einen Audit‑Log. Ich starte den Report‑Export.

**Akzeptanzkriterien**  
- Jede Entscheidung ist mit Klartext‑Begründung dokumentiert.  
- Alle Rechenschritte sind deterministisch reproduzierbar.  
- Ein Audit‑Log listet Inputs, Skriptversionen, Seeds und Ergebnisse pro Fit.  
- LLM‑Hilfen sind als Erklärtexte markiert und beeinflussen keine Berechnung.

---

**Kurzfazit**: Das Modeling wird als deterministische, skriptbasierte Pipeline aufgebaut, die mehrere plausible Modelle erzeugt, objektiv bewertet und durch Human‑in‑the‑loop‑Gates absichert. Der Agent koordiniert ausschließlich validierte Skripte und erzeugt nachvollziehbare Entscheidungen – genau im Sinne des App‑Ziels „geführte, auditierbare Kinetik“.
