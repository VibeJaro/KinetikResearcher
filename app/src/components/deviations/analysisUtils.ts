import type { MappingSelection } from "../../lib/import/mapping";
import type { RawTable } from "../../lib/import/types";

export const normalizeCell = (value: unknown): string => {
  if (value === null || value === undefined) return "";
  if (typeof value === "number" && Number.isFinite(value)) return value.toString();
  if (typeof value === "string") return value.trim();
  return "";
};

export const isStructuralColumn = (
  columnName: string,
  headers: string[],
  mappingSelection: MappingSelection
): boolean => {
  const time = mappingSelection.timeColumnIndex ?? -1;
  const experiment = mappingSelection.experimentColumnIndex ?? -1;
  const values = mappingSelection.valueColumnIndices ?? [];
  const structuralNames = [
    headers[time],
    headers[experiment],
    ...values.map((index) => headers[index])
  ].filter(Boolean);
  return structuralNames.includes(columnName);
};

const toLabel = (value: unknown): string => {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") {
    return Number.isNaN(value) ? "" : value.toString();
  }
  if (typeof value === "string") {
    return value.trim();
  }
  return "";
};

export const buildExperimentRowMap = (
  table: RawTable | null,
  mappingSelection: MappingSelection,
  datasetName: string | null
): Map<string, (string | number | null)[][]> => {
  const map = new Map<string, (string | number | null)[][]>();
  if (!table) return map;

  const experimentIndex = mappingSelection.experimentColumnIndex ?? -1;
  const fallbackLabel = datasetName || "Experiment 1";

  table.rows.forEach((row) => {
    const label =
      experimentIndex === -1 ? fallbackLabel : toLabel(row[experimentIndex]) || "Unlabeled";
    const group = map.get(label) ?? [];
    group.push(row);
    map.set(label, group);
  });

  return map;
};

export const collectValues = (
  rows: (string | number | null)[][],
  columnIndex: number,
  maxItems: number,
  maxLength = 320
): string[] => {
  const seen = new Set<string>();
  const values: string[] = [];
  rows.forEach((row) => {
    const text = normalizeCell(row[columnIndex]).slice(0, maxLength);
    if (!text) return;
    if (seen.has(text)) return;
    seen.add(text);
    values.push(text);
  });
  return values.slice(0, maxItems);
};

export const formatExample = (text?: string): string => {
  if (!text) return "—";
  if (text.length > 60) return `${text.slice(0, 60)}…`;
  return text;
};
