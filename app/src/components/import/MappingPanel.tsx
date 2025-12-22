import type { RawTable } from "../../lib/import/types";
import {
  buildEffectiveTable,
  type MappingSelection
} from "../../lib/import/mapping";

const highlightClass = (
  header: string,
  selection: MappingSelection
): string | null => {
  if (header === selection.timeColumn) {
    return "col-time";
  }
  if (selection.valueColumns.includes(header)) {
    return "col-value";
  }
  if (header === selection.experimentColumn) {
    return "col-experiment";
  }
  if (header === selection.replicateColumn) {
    return "col-replicate";
  }
  return null;
};

type MappingPanelProps = {
  rawTable: RawTable;
  mapping: MappingSelection;
  onMappingChange: (next: MappingSelection) => void;
  onApply: () => void;
  errors: string[];
};

export const MappingPanel = ({
  rawTable,
  mapping,
  onMappingChange,
  onApply,
  errors
}: MappingPanelProps) => {
  const effectiveTable = buildEffectiveTable(rawTable, mapping.useFirstRowAsHeader);
  const headers = effectiveTable.headers;
  const previewRows = effectiveTable.rows.slice(0, 20);

  const toggleValueColumn = (header: string) => {
    if (mapping.valueColumns.includes(header)) {
      onMappingChange({
        ...mapping,
        valueColumns: mapping.valueColumns.filter((column) => column !== header)
      });
      return;
    }
    onMappingChange({
      ...mapping,
      valueColumns: [...mapping.valueColumns, header]
    });
  };

  const isApplyDisabled = !mapping.timeColumn || mapping.valueColumns.length === 0;

  return (
    <div className="mapping-panel">
      <div className="mapping-header">
        <div>
          <h4>Mapping</h4>
          <p className="meta">Select the columns that define time, values, and grouping.</p>
        </div>
        <label className="toggle">
          <input
            type="checkbox"
            checked={mapping.useFirstRowAsHeader}
            onChange={(event) =>
              onMappingChange({
                ...mapping,
                useFirstRowAsHeader: event.target.checked
              })
            }
          />
          First row is header
        </label>
      </div>
      <div className="mapping-grid">
        <label className="field">
          <span>Time column *</span>
          <select
            value={mapping.timeColumn ?? ""}
            onChange={(event) =>
              onMappingChange({ ...mapping, timeColumn: event.target.value || null })
            }
          >
            <option value="">Select column</option>
            {headers.map((header) => (
              <option key={header} value={header}>
                {header}
              </option>
            ))}
          </select>
        </label>
        <div className="field">
          <span>Value columns *</span>
          <div className="checkbox-grid">
            {headers.map((header) => (
              <label key={header} className="checkbox">
                <input
                  type="checkbox"
                  checked={mapping.valueColumns.includes(header)}
                  onChange={() => toggleValueColumn(header)}
                />
                {header}
              </label>
            ))}
          </div>
        </div>
        <label className="field">
          <span>Experiment column</span>
          <select
            value={mapping.experimentColumn ?? ""}
            onChange={(event) =>
              onMappingChange({
                ...mapping,
                experimentColumn: event.target.value || null
              })
            }
          >
            <option value="">(Single experiment)</option>
            {headers.map((header) => (
              <option key={header} value={header}>
                {header}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Replicate column</span>
          <select
            value={mapping.replicateColumn ?? ""}
            onChange={(event) =>
              onMappingChange({
                ...mapping,
                replicateColumn: event.target.value || null
              })
            }
          >
            <option value="">(No replicate)</option>
            {headers.map((header) => (
              <option key={header} value={header}>
                {header}
              </option>
            ))}
          </select>
        </label>
      </div>
      {errors.length > 0 && (
        <div className="inline-error">
          <p>Mapping errors:</p>
          <ul>
            {errors.map((error, index) => (
              <li key={`${error}-${index}`}>{error}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="mapping-actions">
        <button type="button" className="primary" onClick={onApply} disabled={isApplyDisabled}>
          Apply mapping
        </button>
      </div>
      <div className="mapping-preview">
        <div className="preview-header">
          <h5>Preview (first 20 rows)</h5>
          <p className="meta">Highlighted columns reflect the current mapping.</p>
        </div>
        <div className="preview-table">
          <table>
            <thead>
              <tr>
                {headers.map((header) => (
                  <th key={header} className={highlightClass(header, mapping) ?? undefined}>
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {previewRows.map((row, rowIndex) => (
                <tr key={`row-${rowIndex}`}>
                  {headers.map((header, columnIndex) => (
                    <td
                      key={`${header}-${rowIndex}`}
                      className={highlightClass(header, mapping) ?? undefined}
                    >
                      {row[columnIndex] ?? ""}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
