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
};

export type ExperimentMetaValue = string | number | null | undefined;

export function normalizeExperimentId(x: unknown): string {
  const candidate = (x as { experimentId?: unknown; id?: unknown }) ?? {};
  return String(candidate.experimentId ?? candidate.id);
}

export function ensureMetaRaw(
  experiment: Omit<Experiment, "metaRaw"> & Partial<Pick<Experiment, "metaRaw">>
): Experiment {
  return { ...experiment, metaRaw: experiment.metaRaw ?? {} } as Experiment;
}
