## 2026-03-26
- Modeling-Schritt mit echten Daten verdrahtet: nutzt die gemappten Messspalten und die in Schritt 3 vorgemerkten Experimente als Ausgangsbasis.
- LLM-Ergebnisse (Abweichungen, Repräsentativität, Fit-Vormerkungen) bleiben beim Wechseln der Schritte erhalten.

## 2026-03-19
- Modeling-Schritt neu gestaltet: Nutzer:innen ordnen Spalten den Rollen (Edukt, Produkt, Zwischenprodukt, Nebenprodukt) zu und definieren per einfacher Pfeil-Liste das Reaktionsnetzwerk inklusive Nebenpfaden.
- Neue Guidance-Box mit automatischen Hinweisen und CTA-Leiste zur Bestätigung des Netzwerks ergänzt.

## 2026-03-12
- Abweichungen und Repräsentativität zu einem kombinierten LLM-Schritt zusammengeführt: Kommentar- und Parameter-Spalten einmal wählen, pro Experiment laufen zwei LLM-Calls nacheinander.
- Ergebnisansicht überarbeitet: Kacheln füllen eine ganze Zeile, zeigen beide LLM-Ergebnisse in getrennten Sektionen und lassen die Fit-Vormerkung direkt im selben Kachel-Kontext.

## 2026-03-05
- Repräsentativitäts-Check umgesetzt: zusätzlicher LLM-Call pro Experiment vergleicht Referenz- und Kontextspalten, markiert Inkonsistenzen und liefert eine Fit-Empfehlung plus Summary für den Report.
- Neue UI mit Auswahl der Referenz-/Kontextspalten, Fit-Vormerkung je Experiment und Filter nach Kategorien.
- Serverless-Route `api/representativity-scan.ts` ergänzt: validiert Eingaben strikt, ruft bevorzugt gpt-5-mini-2025-08-07 (Fallback gpt-5-mini) auf und liefert strukturierte Findings inklusive Fit-Empfehlung.

## 2026-02-24
- Schritt 3 „Abweichungen“ ersetzt das frühere Grouping: Nutzer:innen wählen Kommentar- und Kontextspalten, der LLM-Scan (GPT-5 mini-2025-08-07 mit Fallback gpt-5-mini, 1 Call pro Experiment) weist Abweichungen den 10 Ontologie-Kategorien zu und zeigt die Original-Textstellen.
- Neues UI mit LLM-Badge, Ontologie-Filter und Status-Pills (Warnungen, fehlerhafte Runs, saubere Experimente); JSON-Schema für Ergebnisse dokumentiert.
- Serverless-Route `api/deviation-scan.ts` ergänzt: validiert Eingaben strikt, ruft bevorzugt gpt-5-mini-2025-08-07 (Fallback gpt-5-mini) auf und liefert strukturierte Findings inklusive Request-ID.

## 2026-01-10
- Abweichungsanalyse: Leere Kommentarspalten werden jetzt als „keine Auffälligkeiten“ behandelt, ohne Fehlermeldung oder LLM-Aufruf.
- README ergänzt: Hinweis, dass leere Kommentarspalten keinen Fehler auslösen.

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
