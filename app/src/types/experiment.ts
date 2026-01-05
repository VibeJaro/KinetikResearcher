export type Series = {
  id: string;
  name: string;
  time: number[];
  y: number[];
  meta?: Record<string, unknown>;
};

export type Experiment = {
  experimentId: string;
  name?: string;
  series: Series[];
  metaRaw: Record<string, string | number | null>;
  columnValues: Record<string, string[]>;
};

export function normalizeExperimentId(x: unknown): string {
  const candidate = (x as { experimentId?: unknown; id?: unknown }) ?? {};
  return String(candidate.experimentId ?? candidate.id);
}

export function ensureMetaRaw(
  experiment: Omit<Experiment, "metaRaw" | "columnValues"> &
    Partial<Pick<Experiment, "metaRaw" | "columnValues">>
): Experiment {
  return {
    ...experiment,
    metaRaw: experiment.metaRaw ?? {},
    columnValues: experiment.columnValues ?? {}
  } as Experiment;
}
