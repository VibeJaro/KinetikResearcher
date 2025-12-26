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
          <span>Value columns (select at least one)</span>
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

        <label className="field">
          Replicate column (optional)
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
            <option value="">None</option>
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
          <div>
            <strong>Mapping applied successfully.</strong>
            <p className="meta">
              {successStats.experimentCount} experiments and {successStats.seriesCount}{" "}
              time series were created.
            </p>
          </div>
          <button type="button" className="primary" onClick={onContinueToValidation}>
            Continue to Validation
          </button>
        </div>
      )}

      {errors.length > 0 && (
        <div className="inline-error">
          <p>Mapping could not be applied. Fix the issues below and try again.</p>
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
          className="primary"
          onClick={onApply}
          disabled={isApplyDisabled}
        >
          Apply mapping
        </button>
      </div>
    </div>
  );
};
