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
- Neues Grouping-Feature nach der Validierung: Spaltenscan per GPT-5.2 (Server-Route `app/api/column-scan.ts`), Faktorextraktion mit Provenance (`app/api/factor-extraction.ts`), deterministische Rezept-Vorschläge und manueller Gruppen-Editor.
- Metadaten aus dem Import werden pro Experiment aggregiert (häufigster Wert, Konsistenzflag) und stehen für den Grouping-Schritt bereit.
- Fallbacks im Grouping: wahlweise eine Sammelgruppe für alle Experimente oder eine Gruppe pro Experiment, falls der Nutzer den LLM-Schritt überspringen will.
