import { useMemo } from "react";
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
      selection.experimentColumnIndex ?? -1,
      ...selection.valueColumnIndices
    ])
  ).filter((index) => index >= 0);

  const isApplyDisabled =
    selection.timeColumnIndex === null || selection.valueColumnIndices.length === 0;
  const hasExperimentColumn = selection.experimentColumnIndex !== null;
  const previewLabel = hasExperimentColumn
    ? "Vorschau der ersten 20 Experimente (erste Zeile)"
    : "Vorschau der ersten 20 Zeilen";

  const previewRows = useMemo(() => {
    const maxRows = 20;
    if (!hasExperimentColumn || selection.experimentColumnIndex === null) {
      return normalizedTable.rows.slice(0, maxRows);
    }
    const experimentIndex = selection.experimentColumnIndex;
    const seen = new Map<string, (string | number | null)[]>();

    normalizedTable.rows.forEach((row) => {
      const rawLabel = row[experimentIndex];
      const label =
        rawLabel === null || rawLabel === undefined
          ? "Unbenanntes Experiment"
          : String(rawLabel).trim() || "Unbenanntes Experiment";
      if (!seen.has(label)) {
        seen.set(label, row);
      }
    });

    return Array.from(seen.values()).slice(0, maxRows);
  }, [hasExperimentColumn, normalizedTable.rows, selection.experimentColumnIndex]);

  return (
    <div className="mapping-panel">
      <div className="mapping-header">
        <div>
          <h4>Mapping</h4>
          <p className="meta">
            Configure how columns map into experiments and series for{" "}
            {fileName ?? "the current file"}.
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
          First row is header
        </label>
      </div>

      <div className="mapping-grid">
        <label className="field">
          Time column (required)
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
            <option value="">Select time column</option>
            {headers.map((header, index) => (
              <option key={`${header}-${index}`} value={index}>
                {header}
              </option>
            ))}
          </select>
        </label>

        <div className="field">
          <span>Value columns (Mehrfachauswahl möglich)</span>
          <select
            multiple
            className="multi-select"
            value={selection.valueColumnIndices.map(String)}
            onChange={(event) => {
              const options = Array.from(event.target.selectedOptions).map((option) =>
                Number(option.value)
              );
              const filtered = options.filter((index) => index !== selection.timeColumnIndex);
              onSelectionChange({ ...selection, valueColumnIndices: filtered });
            }}
          >
            {headers.map((header, index) => (
              <option
                key={`${header}-${index}`}
                value={index}
                disabled={selection.timeColumnIndex === index}
              >
                {header}
              </option>
            ))}
          </select>
          <p className="hint-text">
            Wähle alle Signalspalten aus. Der Zeitstempel darf nicht gleichzeitig als Wert gewählt
            werden.
          </p>
        </div>

        <label className="field">
          Experiment column (optional)
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
            <option value="">None</option>
            {headers.map((header, index) => (
              <option key={`${header}-${index}`} value={index}>
                {header}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="preview-header">
        <p className="muted">{previewLabel}</p>
        {selection.experimentColumnIndex !== null && (
          <span className="chip subtle">
            Experimentsschlüssel: {headers[selection.experimentColumnIndex]}
          </span>
        )}
      </div>

      <MappingPreviewTable
        headers={headers}
        rows={previewRows}
        highlightedColumns={highlightedColumns}
      />

      {successStats && (
        <div className="inline-success">
          <p className="success-title">Mapping applied successfully.</p>
          <p className="meta">
            {successStats.experimentCount} experiments and {successStats.seriesCount} time
            series were created.
          </p>
          <button type="button" className="btn btn-primary" onClick={onContinueToValidation}>
            Continue to Validation
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
          Apply mapping
        </button>
      </div>
    </div>
  );
};
