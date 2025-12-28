import { parseNumericCell } from "../import/mapping";
import type { RawTable } from "../import/types";
import type { ColumnProfile } from "../../types/columnScan";

const MAX_PROFILE_COLUMNS = 500;
const MAX_EXAMPLES = 5;
const MAX_EXAMPLE_LENGTH = 120;

const toExample = (value: string | number | null): string => {
  if (value === null) {
    return "";
  }
  if (typeof value === "number") {
    return Number.isNaN(value) ? "" : value.toString();
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  return trimmed.slice(0, MAX_EXAMPLE_LENGTH);
};

const detectTypeHeuristic = (values: (string | number | null)[]): ColumnProfile["typeHeuristic"] => {
  let numericCount = 0;
  let textCount = 0;

  values.forEach((value) => {
    if (value === null) {
      return;
    }
    const numericValue = parseNumericCell(value);
    if (numericValue !== null) {
      numericCount += 1;
    } else {
      textCount += 1;
    }
  });

  if (numericCount > 0 && textCount > 0) {
    return "mixed";
  }
  if (numericCount > 0) {
    return "numeric";
  }
  return "text";
};

export const buildColumnSummaries = (table: RawTable): ColumnProfile[] => {
  const columnCount = Math.min(table.headers.length, MAX_PROFILE_COLUMNS);
  const totalRows = table.rows.length;

  return Array.from({ length: columnCount }).map((_, index) => {
    const header = table.headers[index];
    const name = header && String(header).trim() ? String(header).trim() : `Column ${index + 1}`;

    let nonNullCount = 0;
    const valuesForType: (string | number | null)[] = [];
    const examples: string[] = [];

    table.rows.forEach((row) => {
      const cell = row[index] ?? null;
      if (cell === null) {
        return;
      }
      if (typeof cell === "number" && Number.isNaN(cell)) {
        return;
      }
      if (typeof cell === "string" && cell.trim().length === 0) {
        return;
      }
      nonNullCount += 1;
      valuesForType.push(cell);
      if (examples.length < MAX_EXAMPLES) {
        const example = toExample(cell);
        if (example) {
          examples.push(example);
        }
      }
    });

    const ratio =
      totalRows === 0 ? 0 : Math.max(0, Math.min(1, nonNullCount / Math.max(totalRows, 1)));

    return {
      name,
      typeHeuristic: detectTypeHeuristic(valuesForType),
      nonNullRatio: ratio,
      examples
    };
  });
};
