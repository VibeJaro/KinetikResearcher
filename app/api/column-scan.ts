import { randomUUID } from "crypto";
import { OpenAI } from "openai";

export const config = {
  runtime: "nodejs"
};

type ColumnTypeHeuristic = "numeric" | "text" | "mixed";

type ColumnInput = {
  name: string;
  typeHeuristic: ColumnTypeHeuristic;
  nonNullRatio: number;
  examples?: string[];
};

type ValidatedRequestBody = {
  columns: ColumnInput[];
  experimentCount?: number;
  knownStructuralColumns: string[];
  includeComments: boolean;
};

type ColumnRole = "condition" | "comment" | "noise";

type ColumnScanResult = {
  selectedColumns: string[];
  columnRoles: Record<string, ColumnRole>;
  factorCandidates: string[];
  notes: string;
  uncertainties: string[];
};

const MAX_COLUMNS = 500;
const MAX_SELECTED_COLUMNS = 8;
const MAX_FACTOR_CANDIDATES = 12;
const MAX_UNCERTAINTIES = 8;

const createRequestId = (): string => {
  try {
    return randomUUID();
  } catch {
    return `req-${Math.random().toString(36).slice(2, 10)}`;
  }
};

const sendJson = (res: any, statusCode: number, payload: Record<string, unknown>) => {
  if (typeof res.status === "function") {
    res.status(statusCode);
  } else {
    res.statusCode = statusCode;
  }

  if (typeof res.setHeader === "function") {
    res.setHeader("Content-Type", "application/json");
  }

  if (typeof res.end === "function") {
    res.end(JSON.stringify(payload));
  } else if (typeof res.json === "function") {
    res.json(payload);
  }
};

const parseJsonBody = async (
  req: any
): Promise<{ ok: true; body: unknown } | { ok: false; error?: unknown }> => {
  try {
    if (req.body !== undefined && req.body !== null) {
      if (typeof req.body === "string") {
        return { ok: true, body: JSON.parse(req.body) };
      }
      if (Buffer.isBuffer(req.body)) {
        return { ok: true, body: JSON.parse(req.body.toString("utf8")) };
      }
      if (typeof req.body === "object") {
        return { ok: true, body: req.body };
      }
    }

    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      if (typeof chunk === "string") {
        chunks.push(Buffer.from(chunk));
      } else {
        chunks.push(chunk);
      }
    }

    if (chunks.length === 0) {
      return { ok: false };
    }

    const raw = Buffer.concat(chunks).toString("utf8");
    return { ok: true, body: JSON.parse(raw) };
  } catch (error) {
    return { ok: false, error };
  }
};

const logStart = (payload: {
  requestId: string;
  method: string | undefined;
  colCount: number | null;
  experimentCount: number | null;
  includeComments: boolean;
}) => {
  console.info("[column-scan] start", payload);
};

const logSuccess = (payload: { requestId: string; selectedColumns: number }) => {
  console.info("[column-scan] success", payload);
};

const logFailure = (requestId: string, error: unknown, fallbackMessage: string) => {
  const payload =
    error instanceof Error
      ? { message: error.message, stack: error.stack }
      : { message: fallbackMessage, stack: undefined };
  console.error("[column-scan] failure", { requestId, ...payload });
};

const validateRequestBody = (
  body: unknown
): { ok: true; value: ValidatedRequestBody } | { ok: false } => {
  if (typeof body !== "object" || body === null) {
    return { ok: false };
  }

  const candidate = body as Record<string, unknown>;
  if (!Array.isArray(candidate.columns) || candidate.columns.length === 0) {
    return { ok: false };
  }

  if (candidate.columns.length > MAX_COLUMNS) {
    return { ok: false };
  }

  const sanitizedColumns: ColumnInput[] = [];
  for (const entry of candidate.columns) {
    if (typeof entry !== "object" || entry === null) {
      return { ok: false };
    }

    const rawName = (entry as Record<string, unknown>).name;
    const name = typeof rawName === "string" ? rawName.trim() : "";
    if (!name) {
      return { ok: false };
    }

    const typeHeuristic = (entry as Record<string, unknown>).typeHeuristic;
    if (typeHeuristic !== "numeric" && typeHeuristic !== "text" && typeHeuristic !== "mixed") {
      return { ok: false };
    }

    const nonNullRatio = (entry as Record<string, unknown>).nonNullRatio;
    if (
      typeof nonNullRatio !== "number" ||
      Number.isNaN(nonNullRatio) ||
      nonNullRatio < 0 ||
      nonNullRatio > 1
    ) {
      return { ok: false };
    }

    const rawExamples = (entry as Record<string, unknown>).examples;
    let examples: string[] | undefined;
    if (rawExamples !== undefined) {
      if (!Array.isArray(rawExamples) || rawExamples.length > 10) {
        return { ok: false };
      }
      examples = rawExamples
        .map((value) => (typeof value === "string" ? value.slice(0, 120) : null))
        .filter((value): value is string => typeof value === "string" && value.trim().length > 0);
    }

    sanitizedColumns.push({
      name,
      typeHeuristic,
      nonNullRatio,
      ...(examples ? { examples } : {})
    });
  }

  const experimentCount = candidate.experimentCount;
  const experimentCountValue =
    typeof experimentCount === "number" && Number.isFinite(experimentCount)
      ? experimentCount
      : undefined;

  const knownStructuralColumnsRaw = candidate.knownStructuralColumns;
  let knownStructuralColumns: string[] = [];
  if (knownStructuralColumnsRaw !== undefined) {
    if (!Array.isArray(knownStructuralColumnsRaw)) {
      return { ok: false };
    }
    if (!knownStructuralColumnsRaw.every((value) => typeof value === "string")) {
      return { ok: false };
    }
    knownStructuralColumns = Array.from(
      new Set(
        knownStructuralColumnsRaw
          .map((value) => value.trim())
          .filter((value): value is string => value.length > 0)
      )
    );
  }

  const includeComments =
    typeof candidate.includeComments === "boolean" ? candidate.includeComments : false;

  return {
    ok: true,
    value: {
      columns: sanitizedColumns,
      experimentCount: experimentCountValue,
      knownStructuralColumns,
      includeComments
    }
  };
};

const createPrompt = (payload: ValidatedRequestBody) => {
  const structuralColumns =
    payload.knownStructuralColumns.length > 0
      ? payload.knownStructuralColumns.join(", ")
      : "(none provided)";

  const rules = [
    "Return only JSON with the keys: selectedColumns, columnRoles, factorCandidates, notes, uncertainties.",
    "No markdown, no additional keys, no prose outside JSON.",
    "selectedColumns: choose the most informative condition/metadata columns, up to 8 total.",
    `Avoid selecting known structural columns: ${structuralColumns} unless necessary for context.`,
    "If a column looks like a comment/notes column, label it as 'comment' in columnRoles and avoid selecting it when includeComments is false.",
    "columnRoles: only 'condition', 'comment', or 'noise'.",
    "factorCandidates: concise lowercase or snakecase strings, max 12.",
    "notes: plain language, max 400 characters.",
    "uncertainties: short bullet-style strings, up to 8 items, each <=160 characters.",
    payload.includeComments
      ? "Comments may be included if useful but must still be labeled as 'comment'."
      : "Exclude comment-like columns from selectedColumns unless absolutely required; still label them as 'comment' if mentioned."
  ];

  return `${rules.join(" \n")}\nColumns: ${JSON.stringify(payload.columns)}\n` +
    `Experiment count hint: ${payload.experimentCount ?? "unknown"}.\n` +
    `Known structural columns: ${structuralColumns}.`;
};

const callOpenAi = async (opts: {
  apiKey: string;
  payload: ValidatedRequestBody;
  requestId: string;
}): Promise<string> => {
  const openai = new OpenAI({ apiKey: opts.apiKey });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25_000);

  try {
    const completion = await openai.chat.completions.create(
      {
        model: "gpt-5.2",
        messages: [
          {
            role: "system",
            content:
              "You are assisting with selecting experiment columns. Respond only with valid JSON matching the schema and rules."
          },
          {
            role: "user",
            content: createPrompt(opts.payload)
          }
        ],
        temperature: 0,
        max_tokens: 400,
        response_format: { type: "json_object" }
      },
      { signal: controller.signal }
    );

    const content = completion.choices?.[0]?.message?.content;
    if (!content || typeof content !== "string") {
      throw new Error("Empty model response");
    }

    return content;
  } finally {
    clearTimeout(timeout);
  }
};

const parseModelJson = (raw: string): { ok: true; value: unknown } | { ok: false } => {
  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch {
    return { ok: false };
  }
};

const validateModelResult = (
  data: unknown
): { ok: true; value: ColumnScanResult } | { ok: false; reason: string } => {
  if (typeof data !== "object" || data === null) {
    return { ok: false, reason: "Missing result object" };
  }

  const result = data as Record<string, unknown>;

  if (!Array.isArray(result.selectedColumns) || result.selectedColumns.length > MAX_SELECTED_COLUMNS) {
    return { ok: false, reason: "Invalid selectedColumns" };
  }

  const selectedColumns = result.selectedColumns.filter(
    (value): value is string => typeof value === "string" && value.trim().length > 0
  );

  const columnRoles = result.columnRoles;
  if (typeof columnRoles !== "object" || columnRoles === null) {
    return { ok: false, reason: "Invalid columnRoles" };
  }

  const validatedRoles: Record<string, ColumnRole> = {};
  for (const [key, value] of Object.entries(columnRoles)) {
    if (value === "condition" || value === "comment" || value === "noise") {
      validatedRoles[key] = value;
    } else {
      return { ok: false, reason: "Unexpected column role" };
    }
  }

  if (!Array.isArray(result.factorCandidates) || result.factorCandidates.length > MAX_FACTOR_CANDIDATES) {
    return { ok: false, reason: "Invalid factorCandidates" };
  }
  const factorCandidates = result.factorCandidates.filter(
    (value): value is string => typeof value === "string" && value.trim().length > 0
  );

  if (typeof result.notes !== "string" || result.notes.length > 400) {
    return { ok: false, reason: "Invalid notes" };
  }

  if (!Array.isArray(result.uncertainties) || result.uncertainties.length > MAX_UNCERTAINTIES) {
    return { ok: false, reason: "Invalid uncertainties" };
  }

  const uncertainties = result.uncertainties.filter(
    (value): value is string => typeof value === "string" && value.length <= 160
  );

  if (uncertainties.length !== result.uncertainties.length) {
    return { ok: false, reason: "Uncertainty too long" };
  }

  return {
    ok: true,
    value: {
      selectedColumns,
      columnRoles: validatedRoles,
      factorCandidates,
      notes: result.notes,
      uncertainties
    }
  };
};

export default async function handler(req: any, res: any) {
  const requestId = createRequestId();

  if (req.method !== "POST") {
    logStart({
      requestId,
      method: req.method,
      colCount: null,
      experimentCount: null,
      includeComments: false
    });
    return sendJson(res, 405, {
      ok: false,
      error: "Method Not Allowed",
      requestId
    });
  }

  const parsedBody = await parseJsonBody(req);
  if (!parsedBody.ok) {
    logStart({
      requestId,
      method: req.method,
      colCount: null,
      experimentCount: null,
      includeComments: false
    });
    logFailure(requestId, parsedBody.error, "Invalid request body");
    return sendJson(res, 400, {
      ok: false,
      error: "Invalid request",
      requestId
    });
  }

  const validation = validateRequestBody(parsedBody.body);
  if (!validation.ok) {
    logStart({
      requestId,
      method: req.method,
      colCount: null,
      experimentCount: null,
      includeComments: false
    });
    return sendJson(res, 400, {
      ok: false,
      error: "Invalid request",
      requestId
    });
  }

  const validated = validation.value;
  logStart({
    requestId,
    method: req.method,
    colCount: validated.columns.length,
    experimentCount: validated.experimentCount ?? null,
    includeComments: validated.includeComments
  });

  const apiKey = process.env.OPENAI_API_KEY;
  if (typeof apiKey !== "string" || apiKey.trim().length === 0) {
    logFailure(requestId, null, "Missing OPENAI_API_KEY");
    return sendJson(res, 500, {
      ok: false,
      error: "Missing OPENAI_API_KEY",
      requestId
    });
  }

  try {
    const rawModelOutput = await callOpenAi({ apiKey, payload: validated, requestId });
    console.info("[column-scan] model-output", {
      requestId,
      snippet: rawModelOutput.slice(0, 500)
    });

    const parsedModel = parseModelJson(rawModelOutput);
    if (!parsedModel.ok) {
      logFailure(requestId, null, "Model output parse failure");
      return sendJson(res, 502, {
        ok: false,
        error: "Invalid model output",
        requestId,
        details: "Non-JSON model output"
      });
    }

    const validatedResult = validateModelResult(parsedModel.value);
    if (!validatedResult.ok) {
      logFailure(requestId, null, validatedResult.reason);
      return sendJson(res, 502, {
        ok: false,
        error: "Invalid model output",
        requestId,
        details: validatedResult.reason
      });
    }

    logSuccess({ requestId, selectedColumns: validatedResult.value.selectedColumns.length });

    return sendJson(res, 200, {
      ok: true,
      requestId,
      result: validatedResult.value
    });
  } catch (error) {
    logFailure(requestId, error, "OpenAI call failed");
    return sendJson(res, 502, {
      ok: false,
      error: "Invalid model output",
      requestId,
      details: error instanceof Error ? error.message : "OpenAI call failed"
    });
  }
}
