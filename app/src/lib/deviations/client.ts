import { buildDeviationPrompt } from "./prompt";
import { parseDeviationResponse } from "./parser";
import { ONTOLOGY_CATEGORIES } from "./categories";
import type {
  DeviationAnalysis,
  DeviationClientRequest,
  DeviationClientResult,
  ExperimentComment
} from "./types";

const DEFAULT_MODEL = "gpt-5.2-mini";
const DEFAULT_TIMEOUT = 12_000;

const toStringValue = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return value.toString();
  return null;
};

export const collectExperimentComments = (
  experiment: DeviationClientRequest["experiment"],
  includeMetaKeys?: string[]
): ExperimentComment[] => {
  const pairs = Object.entries(experiment.metaRaw ?? {});
  const filtered = includeMetaKeys
    ? pairs.filter(([key]) => includeMetaKeys.includes(key))
    : pairs;

  return filtered
    .map(([key, raw]) => {
      const value = toStringValue(raw);
      return value ? { key, value } : null;
    })
    .filter((entry): entry is ExperimentComment => Boolean(entry));
};

export class DeviationClient {
  constructor(
    private readonly options: { model?: string; endpoint?: string; timeoutMs?: number } = {}
  ) {}

  async analyzeExperiment(
    request: DeviationClientRequest
  ): Promise<DeviationClientResult> {
    const comments = collectExperimentComments(request.experiment, request.includeMetaKeys);
    const { system, user, commentText } = buildDeviationPrompt({
      experiment: request.experiment,
      comments,
      categories: ONTOLOGY_CATEGORIES
    });

    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      request.timeoutMs ?? this.options.timeoutMs ?? DEFAULT_TIMEOUT
    );

    const response = await fetch(this.options.endpoint ?? "/api/deviation-analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        experimentId: request.experiment.experimentId,
        experimentName: request.experiment.name,
        model: request.model ?? this.options.model ?? DEFAULT_MODEL,
        prompt: { system, user },
        categories: ONTOLOGY_CATEGORIES,
        commentText
      }),
      signal: controller.signal
    }).finally(() => clearTimeout(timeout));

    let data: unknown = null;
    let requestId: string | null = null;
    try {
      data = await response.json();
      requestId = (data as any)?.requestId ?? null;
    } catch {
      // ignored, handled below
    }

    if (!response.ok || !(data as any)?.ok) {
      const message =
        (data as any)?.error ?? `Deviation analysis failed (${response.statusText})`;
      throw new Error(message);
    }

    const parsed = parseDeviationResponse((data as any).result ?? {});
    return {
      result: { ...parsed, model: request.model ?? this.options.model ?? DEFAULT_MODEL },
      requestId
    };
  }
}

const CATEGORY_KEYWORDS: Record<string, RegExp[]> = {
  instrument_issue: [/pump/i, /sensor/i, /leak/i],
  calibration_gap: [/calib/i, /offset/i, /drift/i],
  contamination_suspected: [/kontamination/i, /contaminat/i, /verunreinigung/i],
  sampling_error: [/sampling/i, /probe/i, /pipette/i],
  data_entry_problem: [/typo/i, /vertippt/i, /copy/i, /format/i],
  procedure_deviation: [/abweichung/i, /protocol/i, /soll/i],
  unexpected_reaction: [/unexpected/i, /exotherm/i, /color/i],
  environmental_condition: [/temp/i, /pressure/i, /humidity/i],
  missing_context: [/unbekannt/i, /missing/i, /unklar/i],
  quality_control_flag: [/qc/i, /review/i, /flag/i]
};

export const analyzeExperimentForDeviations = (
  request: DeviationClientRequest
): DeviationAnalysis => {
  const comments = collectExperimentComments(request.experiment, request.includeMetaKeys);
  const commentText = comments.map((item) => item.value.toLowerCase()).join(" ");

  const categories: DeviationAnalysis["categories"] = [];
  (Object.keys(CATEGORY_KEYWORDS) as (keyof typeof CATEGORY_KEYWORDS)[]).forEach((category) => {
    const hits = CATEGORY_KEYWORDS[category].some((regex) => regex.test(commentText));
    if (hits) {
      categories.push({
        category,
        severity: "medium",
        rationale: `Heuristischer Treffer für ${category}`,
        sourceColumns: comments.map((item) => item.key)
      });
    }
  });

  return {
    experimentId: request.experiment.experimentId,
    experimentName: request.experiment.name,
    summary:
      categories.length > 0
        ? `Heuristische Kategorien gefunden: ${categories.map((c) => c.category).join(", ")}`
        : "Keine klaren Abweichungen in Kommentaren gefunden (Fallback).",
    categories: categories.slice(0, 3),
    model: "fallback-rules",
    usedFallback: true
  };
};
