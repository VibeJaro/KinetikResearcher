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
    new Set([selection.timeColumnIndex ?? -1, selection.experimentColumnIndex ?? -1, ...selection.valueColumnIndices])
  ).filter((index) => index >= 0);

  const normalizeLabel = (value: string | number | null): string => {
    if (value === null) return "";
    if (typeof value === "number") return Number.isNaN(value) ? "" : value.toString();
    return value.trim();
  };

  const maxPreviewItems = 20;
  const previewRows =
    selection.experimentColumnIndex === null
      ? normalizedTable.rows.slice(0, maxPreviewItems)
      : normalizedTable.rows.reduce<(string | number | null)[][]>((acc, row) => {
          const experimentIndex = selection.experimentColumnIndex ?? 0;
          const label = normalizeLabel(row[experimentIndex] ?? null) || "Unlabeled experiment";
          if (acc.length >= maxPreviewItems) return acc;
          const alreadyIncluded = acc.some(
            (existing) => normalizeLabel(existing[experimentIndex] ?? null) === label
          );
          if (!alreadyIncluded) {
            acc.push(row);
          }
          return acc;
        }, []);

  const previewDescription =
    selection.experimentColumnIndex === null
      ? "Vorschau der ersten 20 Zeilen"
      : "Vorschau der ersten 20 Experimente (erste Zeile)";

  const isApplyDisabled =
    selection.timeColumnIndex === null || selection.valueColumnIndices.length === 0;

  return (
    <div className="mapping-panel">
      <div className="mapping-header">
        <div>
          <p className="eyebrow">Spalten zuweisen</p>
          <h4>Mapping</h4>
          <p className="meta">
            Ordne Zeit, Werte und Experimente zu. Spalten mit neuer Auswahl direkt in der Vorschau
            prüfen.
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

      <div className="mapping-grid">
        <label className="field">
          Zeit-Spalte (Pflicht)
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
            <option value="">Zeit-Spalte wählen</option>
            {headers.map((header, index) => (
              <option key={`${header}-${index}`} value={index}>
                {header}
              </option>
            ))}
          </select>
        </label>

        <div className="field">
          <span>Werte-Spalten (Mehrfachauswahl)</span>
          <select
            multiple
            className="multi-select"
            value={selection.valueColumnIndices.map(String)}
            onChange={(event) => {
              const selectedValues = Array.from(event.target.selectedOptions).map((option) =>
                Number(option.value)
              );
              const filtered = selectedValues.filter((value) => value !== selection.timeColumnIndex);
              onSelectionChange({ ...selection, valueColumnIndices: filtered });
            }}
          >
            {headers.map((header, index) => (
              <option key={`${header}-${index}`} value={index} disabled={selection.timeColumnIndex === index}>
                {header}
              </option>
            ))}
          </select>
            <p className="meta">Tipp: Du kannst mehrere Werte-Spalten auswählen, die Reihenfolge bleibt erhalten.</p>
        </div>

        <label className="field">
          Experiment-Spalte (optional)
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
      </div>

      <div className="mapping-preview-card">
        <div className="mapping-preview-header">
          <div>
            <p className="eyebrow">Vorschau</p>
            <p className="meta">{previewDescription}</p>
          </div>
          {selection.experimentColumnIndex !== null && (
            <span className="pill soft">
              Gruppiert nach {headers[selection.experimentColumnIndex] ?? "Experiment"}
            </span>
          )}
        </div>
        <MappingPreviewTable
          table={normalizedTable}
          highlightedColumns={highlightedColumns}
          rowsOverride={previewRows}
          maxRows={maxPreviewItems}
        />
      </div>

      {successStats && (
        <div className="inline-success">
          <p className="success-title">Mapping übernommen.</p>
          <p className="meta">
            {successStats.experimentCount} Experimente und {successStats.seriesCount} Zeitreihen
            wurden erzeugt.
          </p>
          <button type="button" className="btn btn-primary" onClick={onContinueToValidation}>
            Weiter zur Validierung
          </button>
        </div>
      )}

      {errors.length > 0 && (
        <div className="inline-error">
          <p className="error-title">Mapping could not be applied.</p>
          <p className="meta">
            Fix the issues below and apply the mapping again.
          </p>
          <ul>
            {errors.slice(0, 3).map((error) => (
              <li key={`${error.column}-${error.rowIndex}`}>
                Row {error.rowIndex}: {error.column} — {error.message}
              </li>
            ))}
            {errors.length > 3 && (
              <li>+{errors.length - 3} more rows need attention.</li>
            )}
          </ul>
        </div>
      )}

      <div className="mapping-actions">
        {stats && (
          <p className="meta">
            Mapped {stats.experimentCount} experiments · {stats.seriesCount} series ·{" "}
            {stats.pointCount} points
          </p>
        )}
        <button
          type="button"
          className="btn btn-primary"
          onClick={onApply}
          disabled={isApplyDisabled}
        >
          Mapping übernehmen
        </button>
      </div>
    </div>
  );
};
