import type { RawTable } from "../../lib/import/types";
import {
  normalizeMappingTable,
  type MappingError,
  type MappingSelection,
  type MappingStats
} from "../../lib/import/mapping";
import { MappingPreviewTable } from "./MappingPreviewTable";

type MappingPanelProps = {
  table: RawTable;
  fileName: string | null;
  selection: MappingSelection;
  onSelectionChange: (next: MappingSelection) => void;
  onApply: () => void;
  onContinueToValidation: () => void;
  errors: MappingError[];
  stats: MappingStats | null;
  successStats: MappingStats | null;
};

export const MappingPanel = ({
  table,
  fileName,
  selection,
  onSelectionChange,
  onApply,
  onContinueToValidation,
  errors,
  stats,
  successStats
}: MappingPanelProps) => {
  const normalizedTable = normalizeMappingTable(table, selection.firstRowIsHeader);
  const headers = normalizedTable.headers;

  const highlightedColumns = Array.from(
    new Set([
      selection.timeColumnIndex ?? -1,
      ...selection.valueColumnIndices
    ])
  ).filter((index) => index >= 0);

  const isApplyDisabled =
    selection.timeColumnIndex === null || selection.valueColumnIndices.length === 0;

  return (
    <div className="mapping-panel panel">
      <div className="panel-header mapping-header">
        <div>
          <p className="eyebrow">Spalten zuordnen</p>
          <h3>Mapping konfigurieren</h3>
          <p className="muted">
            Wir übernehmen Header aus {fileName ?? "der Datei"} und schlagen eine Zeitspalte vor. Markiere, was als Werte, Experiment oder Replikat gelten soll.
          </p>
        </div>
        <label className="toggle">
          <input
            type="checkbox"
            checked={selection.firstRowIsHeader}
            onChange={(event) =>
              onSelectionChange({
                ...selection,
                firstRowIsHeader: event.target.checked
              })
            }
          />
          Erste Zeile ist Header
        </label>
      </div>

      <div className="mapping-body">
        <div className="mapping-grid">
          <label className="field">
            Zeitspalte (Pflicht)
            <select
              value={selection.timeColumnIndex ?? ""}
              onChange={(event) => {
                const nextIndex =
                  event.target.value === "" ? null : Number(event.target.value);
                onSelectionChange({
                  ...selection,
                  timeColumnIndex: nextIndex,
                  valueColumnIndices: selection.valueColumnIndices.filter(
                    (index) => index !== nextIndex
                  )
                });
              }}
            >
              <option value="">Zeitspalte wählen</option>
              {headers.map((header, index) => (
                <option key={`${header}-${index}`} value={index}>
                  {header}
                </option>
              ))}
            </select>
            <p className="hint-text">Empfohlen: Spalten mit time, t, timestamp.</p>
          </label>

          <div className="field">
            <span>Wertespalten (mind. eine)</span>
            <div className="mapping-value-grid">
              {headers.map((header, index) => (
                <label key={`${header}-${index}`} className="checkbox">
                  <input
                    type="checkbox"
                    checked={selection.valueColumnIndices.includes(index)}
                    disabled={selection.timeColumnIndex === index}
                    onChange={(event) => {
                      const nextValues = event.target.checked
                        ? [...selection.valueColumnIndices, index]
                        : selection.valueColumnIndices.filter((value) => value !== index);
                      onSelectionChange({ ...selection, valueColumnIndices: nextValues });
                    }}
                  />
                  {header}
                </label>
              ))}
            </div>
            <p className="hint-text">Mehrere Wertespalten erzeugen mehrere Zeitreihen.</p>
          </div>

          <label className="field">
            Experiment (optional)
            <select
              value={selection.experimentColumnIndex ?? ""}
              onChange={(event) =>
                onSelectionChange({
                  ...selection,
                  experimentColumnIndex:
                    event.target.value === "" ? null : Number(event.target.value)
                })
              }
            >
              <option value="">Keine</option>
              {headers.map((header, index) => (
                <option key={`${header}-${index}`} value={index}>
                  {header}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            Replikat (optional)
            <select
              value={selection.replicateColumnIndex ?? ""}
              onChange={(event) =>
                onSelectionChange({
                  ...selection,
                  replicateColumnIndex:
                    event.target.value === "" ? null : Number(event.target.value)
                })
              }
            >
              <option value="">Keine</option>
              {headers.map((header, index) => (
                <option key={`${header}-${index}`} value={index}>
                  {header}
                </option>
              ))}
            </select>
          </label>
        </div>

        <MappingPreviewTable table={normalizedTable} highlightedColumns={highlightedColumns} />

        {successStats && (
          <div className="inline-success">
            <p className="success-title">Mapping angewendet.</p>
            <p className="meta">
              {successStats.experimentCount} Experimente · {successStats.seriesCount} Serien ·{" "}
              {successStats.pointCount} Punkte
            </p>
            <button type="button" className="primary" onClick={onContinueToValidation}>
              Weiter zur Validierung
            </button>
          </div>
        )}

        {errors.length > 0 && (
          <div className="inline-error">
            <p className="error-title">Mapping konnte nicht angewendet werden.</p>
            <p className="meta">Bitte die markierten Punkte korrigieren und erneut anwenden.</p>
            <ul>
              {errors.slice(0, 3).map((error) => (
                <li key={`${error.column}-${error.rowIndex}`}>
                  Zeile {error.rowIndex}: {error.column} — {error.message}
                </li>
              ))}
              {errors.length > 3 && (
                <li>+{errors.length - 3} weitere Zeilen benötigen einen Fix.</li>
              )}
            </ul>
          </div>
        )}

        <div className="mapping-actions">
          {stats ? (
            <p className="meta">
              Mapped {stats.experimentCount} Experimente · {stats.seriesCount} Serien ·{" "}
              {stats.pointCount} Punkte
            </p>
          ) : (
            <p className="muted">Wähle Zeit- und Wertespalten und klicke auf „Mapping anwenden“.</p>
          )}
          <div className="action-row">
            <button
              type="button"
              className="ghost"
              onClick={onContinueToValidation}
              disabled={!successStats}
            >
              Validierung öffnen
            </button>
            <button
              type="button"
              className="primary"
              onClick={onApply}
              disabled={isApplyDisabled}
            >
              Mapping anwenden
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
