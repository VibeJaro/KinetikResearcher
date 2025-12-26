## Aktualisierung

- Die Import-Ansicht enthält nun eine Mapping-Oberfläche, mit der Zeit-, Werte-, Experiment- und Replikatspalten ausgewählt werden können.
- Eine Vorschau-Tabelle hebt die gewählten Spalten hervor und zeigt die ersten Datenzeilen.
- Beim Anwenden der Zuordnung werden Experimente und Messreihen erstellt, die Eingaben geprüft und im Audit-Log protokolliert.
- Nach dem Mapping gibt es jetzt einen Validierungsbericht mit Status (sauber, benötigt Infos, kritisch), Kennzahlen und klaren Hinweisen zu möglichen Datenproblemen.
- Der Bericht zeigt einfache Handlungen: zurück zur Zuordnung oder weiter, solange nichts Kritisches vorliegt.
- Nach erfolgreichem Mapping erscheint eine klare Erfolgsmeldung mit Hinweis, wie es weitergeht, inklusive direktem Button zur Validierung.
- Warnungen und Fehler sind nun in verständlicher Sprache formuliert und pro Experiment gruppiert, inklusive optionaler technischer Details.
- Die Experiment-Statusanzeigen im Sidebar spiegeln Warnungen und Fehler korrekt wider und unterscheiden zwischen sauber, Hinweisbedarf und kritisch.
- Dataset-weite Fehler werden separat angezeigt, ohne einzelne Experimente pauschal zu blockieren.
- Die Validierung zeigt nun pro Experiment ein Plot (y vs. t), verdichtete QC-Metriken (Punkte, Zeitspanne, Δt, Monotonie, verworfene Zeilen) und die bekannten Findings mit Status-Indikator.
- Eine globale Auswahl der Zeiteinheit (Sekunden, Minuten, Stunden, Tage) steuert die Normalisierung numerischer Zeiten auf Sekunden; Datums-/Zeitstempel werden relativ zu t0 berechnet, und potenzielle Excel-Serien werden als Hinweis markiert.
- Die Status-Zusammenfassung (clean / needs-info / broken) sowie der Weiter-Button respektieren nun den Validierungszustand aus den Findings, sodass fehlerhafte Datensätze nicht versehentlich fortgesetzt werden.
