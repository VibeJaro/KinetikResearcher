
## 2025-12-30
- Sticky Header, Stepper und Workspace sind zentriert, damit Logo, Titel und Cards bündig sitzen.
- Upload-Card mit neuem Warnhinweis („Achtung, keine vertraulichen Daten hochladen!“) und Klarstellung zur lokalen Verarbeitung.
- Value-Spalten-Mapping per Dropdown mit Mehrfachauswahl; Replicate-Auswahl und -Handling wurden entfernt.
- Mapping-Vorschau wechselt dynamisch: ohne Experimentspalte die ersten 20 Zeilen, mit Experimentspalte die erste Zeile der ersten 20 Experimente inkl. Hinweistext.
- Mapping-CTAs (Apply Mapping, Continue to Validation) greifen das aktualisierte Button-Styling auf.

## 2025-02-21
- Import & Mapping-Screen komplett auf das neue Draft-Layout umgestellt (Header mit Badge, horizontaler 5-Schritte-Stepper, card-basierter Container).
- Upload-Experience überarbeitet: Drag-and-Drop-Zone mit klaren Hinweisen, eingebettetem Dateiauswahl-Button und Fehlermeldung im Card-Stil; Reset-Button „Entfernen“ entfernt importierte Datei inkl. Mapping-State.
- Mapping-Ansicht in Card verlegt und Metadaten-Headerchips ergänzt, damit die gefundenen Spalten sofort sichtbar sind; Weiterleitung zur Validierung nur noch über das neue CTA.
- Schritt-Navigation restrukturiert (Schlüssel import/validation/grouping/…); deaktivierte Steps basieren jetzt auf Mapping-Erfolg bzw. vorhandenen Experimenten.
- Styling erneuert (App.css) für das neue UI-Grundgerüst aus dem Design-Draft; Tests an neue Texte angepasst.
