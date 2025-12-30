type MappingPreviewTableProps = {
  headers: string[];
  rows: (string | number | null)[][];
  highlightedColumns: number[];
};

const formatCell = (cell: string | number | null): string => {
  if (cell === null) {
    return "";
  }
  if (typeof cell === "number") {
    return Number.isNaN(cell) ? "" : cell.toString();
  }
  return cell;
};

export const MappingPreviewTable = ({ headers, rows, highlightedColumns }: MappingPreviewTableProps) => (
  <div className="mapping-preview">
    <table>
      <thead>
        <tr>
          <th className="row-index">#</th>
          {headers.map((header, index) => (
            <th
              key={`${header}-${index}`}
              className={highlightedColumns.includes(index) ? "highlight" : ""}
            >
              {header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, rowIndex) => (
          <tr key={`row-${rowIndex}`}>
            <td className="row-index">{rowIndex + 1}</td>
            {headers.map((_, columnIndex) => (
              <td
                key={`cell-${rowIndex}-${columnIndex}`}
                className={highlightedColumns.includes(columnIndex) ? "highlight" : ""}
              >
                {formatCell(row[columnIndex] ?? null)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);
