
## 2026-01-10
- Neuer Schritt „Abweichungen“ ersetzt Grouping: Nutzer:innen wählen Kommentar- und Parameter-Spalten, das LLM scannt jede Messung sequentiell nach 10 festen Auffälligkeits-Kategorien und zeigt Textstellen plus Herkunftsspalten.
- UI ergänzt um Ontologie-Badges, Filter („nur ohne Auffälligkeiten“, „mit Dosierabweichung“) und kompakte Ergebnis-Kacheln pro Experiment.
- OpenAI-API-Route `/api/deviation-analysis` hinzugefügt, inklusive JSON-Schema-Validierung und Ontologie-Prompt; Mapping speichert Meta-Spalten, damit Kommentare/Parameter pro Experiment verfügbar sind.

## 2026-01-02
- Validierungstexte durchgehend auf Deutsch gestellt und Status/Schweregrade klar benannt.
- Serien-Check um Mini-Plots (Punkte + schwarze Linie) ergänzt, um Plausibilität pro Reihe sofort zu sehen.
- Validierungsabschnitt mit Schritt-für-Schritt-Hinweisen angereichert, damit Nutzer:innen sicher entscheiden können, ob sie weitergehen oder zum Mapping zurückspringen.

## 2025-12-30
- Sticky Header und Stepper-Inhalt auf den Card-Container ausgerichtet; Marken-Text vertikal zentriert.
- Upload-Zone mit klarerem Hinweis: lokale Verarbeitung, kein vertrauliches Material hochladen.
- Mapping-UI überarbeitet: Werte-Spalten per Mehrfachauswahl im Dropdown, Replicate-Auswahl entfernt und nachgelagerter Code bereinigt, Buttons im CTA-Stil angepasst.
- Vorschau reagiert auf die Experiment-Spalte und zeigt sofort die ersten 20 Experimente (jeweils erste Zeile) mit entsprechendem Hinweistext.

## 2025-02-21
- Import & Mapping-Screen komplett auf das neue Draft-Layout umgestellt (Header mit Badge, horizontaler 5-Schritte-Stepper, card-basierter Container).
- Upload-Experience überarbeitet: Drag-and-Drop-Zone mit klaren Hinweisen, eingebettetem Dateiauswahl-Button und Fehlermeldung im Card-Stil; Reset-Button „Entfernen“ entfernt importierte Datei inkl. Mapping-State.
- Mapping-Ansicht in Card verlegt und Metadaten-Headerchips ergänzt, damit die gefundenen Spalten sofort sichtbar sind; Weiterleitung zur Validierung nur noch über das neue CTA.
- Schritt-Navigation restrukturiert (Schlüssel import/validation/grouping/…); deaktivierte Steps basieren jetzt auf Mapping-Erfolg bzw. vorhandenen Experimenten.
- Styling erneuert (App.css) für das neue UI-Grundgerüst aus dem Design-Draft; Tests an neue Texte angepasst.
