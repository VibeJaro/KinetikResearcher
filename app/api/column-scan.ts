import { randomUUID } from "crypto";
import OpenAI from "openai";

export const config = {
  runtime: "nodejs"
};

type ColumnRequest = {
  name: string;
  typeHeuristic: "numeric" | "text" | "mixed";
  nonNullRatio: number;
  examples?: string[];
};

type ColumnScanRequest = {
  columns: ColumnRequest[];
  experimentCount?: number;
  knownStructuralColumns?: string[];
  includeComments?: boolean;
};

type ColumnScanModelResult = {
  selectedColumns: string[];
  columnRoles: Record<string, "condition" | "comment" | "noise">;
  factorCandidates: string[];
  notes: string;
  uncertainties: string[];
};

type ValidatedRequest = {
  columns: ColumnRequest[];
  experimentCount?: number;
  knownStructuralColumns: string[];
  includeComments: boolean;
};

type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; message: string };

const MAX_COLUMNS = 500;
const MAX_EXAMPLES = 10;
const MAX_EXAMPLE_LENGTH = 120;
const MAX_SELECTED_COLUMNS = 8;
const MAX_FACTOR_CANDIDATES = 12;
const MAX_UNCERTAINTIES = 8;
const MAX_NOTES_LENGTH = 400;
const MAX_UNCERTAINTY_LENGTH = 160;

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

const parseBody = async (
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

const logError = (requestId: string, error: unknown, fallbackMessage: string) => {
  const payload =
    error instanceof Error
      ? { message: error.message, stack: error.stack }
      : { message: fallbackMessage, stack: undefined };
  console.error("[column-scan] failure", { requestId, ...payload });
};

const hasOpenAIKey = (): boolean =>
  typeof process.env.OPENAI_API_KEY === "string" && process.env.OPENAI_API_KEY.trim() !== "";

const truncateExample = (value: unknown): string => {
  if (typeof value !== "string") {
    return "";
  }
  if (value.length <= MAX_EXAMPLE_LENGTH) {
    return value;
  }
  return value.slice(0, MAX_EXAMPLE_LENGTH);
};

const sanitizeExamples = (examples: unknown): ValidationResult<string[]> => {
  if (examples === undefined) {
    return { ok: true, value: [] };
  }
  if (!Array.isArray(examples) || examples.length > MAX_EXAMPLES) {
    return { ok: false, message: "Invalid examples" };
  }
  const sanitized = examples
    .map((item) => truncateExample(item))
    .filter((item) => item.length > 0);
  return { ok: true, value: sanitized };
};

const sanitizeColumns = (columns: unknown): ValidationResult<ColumnRequest[]> => {
  if (!Array.isArray(columns) || columns.length === 0 || columns.length > MAX_COLUMNS) {
    return { ok: false, message: "Invalid columns" };
  }

  const sanitized: ColumnRequest[] = [];
  for (const entry of columns) {
    if (typeof entry !== "object" || entry === null) {
      return { ok: false, message: "Invalid column shape" };
    }
    const name = typeof (entry as any).name === "string" ? (entry as any).name.trim() : "";
    const typeHeuristic = (entry as any).typeHeuristic;
    const nonNullRatio = (entry as any).nonNullRatio;
    const examplesResult = sanitizeExamples((entry as any).examples);

    if (!examplesResult.ok) {
      return examplesResult;
    }
    if (!name) {
      return { ok: false, message: "Invalid column name" };
    }
    if (!["numeric", "text", "mixed"].includes(typeHeuristic)) {
      return { ok: false, message: "Invalid typeHeuristic" };
    }
    if (typeof nonNullRatio !== "number" || !Number.isFinite(nonNullRatio)) {
      return { ok: false, message: "Invalid nonNullRatio" };
    }
    if (nonNullRatio < 0 || nonNullRatio > 1) {
      return { ok: false, message: "Invalid nonNullRatio" };
    }

    sanitized.push({
      name,
      typeHeuristic,
      nonNullRatio,
      examples: examplesResult.value
    });
  }

  return { ok: true, value: sanitized };
};

const validateRequest = (body: unknown): ValidationResult<ValidatedRequest> => {
  if (typeof body !== "object" || body === null) {
    return { ok: false, message: "Invalid request" };
  }
  const columnResult = sanitizeColumns((body as any).columns);
  if (!columnResult.ok) {
    return { ok: false, message: "Invalid request" };
  }

  const experimentCount =
    (body as any).experimentCount === undefined
      ? undefined
      : typeof (body as any).experimentCount === "number" &&
          Number.isFinite((body as any).experimentCount)
        ? (body as any).experimentCount
        : null;

  if (experimentCount === null) {
    return { ok: false, message: "Invalid request" };
  }

  const knownStructuralColumnsRaw = (body as any).knownStructuralColumns;
  let knownStructuralColumns: string[] = [];
  if (knownStructuralColumnsRaw !== undefined) {
    if (!Array.isArray(knownStructuralColumnsRaw)) {
      return { ok: false, message: "Invalid request" };
    }
    knownStructuralColumns = knownStructuralColumnsRaw
      .filter((item) => typeof item === "string")
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
  }

  const includeCommentsRaw = (body as any).includeComments;
  if (includeCommentsRaw !== undefined && typeof includeCommentsRaw !== "boolean") {
    return { ok: false, message: "Invalid request" };
  }

  return {
    ok: true,
    value: {
      columns: columnResult.value,
      experimentCount: experimentCount === undefined ? undefined : experimentCount,
      knownStructuralColumns,
      includeComments: includeCommentsRaw === true
    }
  };
};

const validateModelResult = (data: unknown): ValidationResult<ColumnScanModelResult> => {
  if (typeof data !== "object" || data === null) {
    return { ok: false, message: "Invalid model output" };
  }
  const { selectedColumns, columnRoles, factorCandidates, notes, uncertainties, ...rest } =
    data as any;

  if (Object.keys(rest ?? {}).length > 0) {
    return { ok: false, message: "Invalid model output" };
  }

  if (
    !Array.isArray(selectedColumns) ||
    selectedColumns.length > MAX_SELECTED_COLUMNS ||
    selectedColumns.some((item) => typeof item !== "string" || item.trim() === "")
  ) {
    return { ok: false, message: "Invalid model output" };
  }

  if (typeof columnRoles !== "object" || columnRoles === null) {
    return { ok: false, message: "Invalid model output" };
  }
  const normalizedRoles: Record<string, "condition" | "comment" | "noise"> = {};
  for (const [key, value] of Object.entries(columnRoles)) {
    if (!["condition", "comment", "noise"].includes(value as string) || !key.trim()) {
      return { ok: false, message: "Invalid model output" };
    }
    normalizedRoles[key] = value as "condition" | "comment" | "noise";
  }

  if (
    !Array.isArray(factorCandidates) ||
    factorCandidates.length > MAX_FACTOR_CANDIDATES ||
    factorCandidates.some((item) => typeof item !== "string" || item.trim() === "")
  ) {
    return { ok: false, message: "Invalid model output" };
  }

  if (typeof notes !== "string" || notes.length > MAX_NOTES_LENGTH) {
    return { ok: false, message: "Invalid model output" };
  }

  if (
    !Array.isArray(uncertainties) ||
    uncertainties.length > MAX_UNCERTAINTIES ||
    uncertainties.some(
      (item) => typeof item !== "string" || item.length === 0 || item.length > MAX_UNCERTAINTY_LENGTH
    )
  ) {
    return { ok: false, message: "Invalid model output" };
  }

  return {
    ok: true,
    value: {
      selectedColumns: selectedColumns.map((item: string) => item.trim()),
      columnRoles: normalizedRoles,
      factorCandidates: factorCandidates.map((item: string) => item.trim()),
      notes,
      uncertainties
    }
  };
};

const buildPrompt = (payload: ValidatedRequest): { system: string; user: string } => {
  const system = [
    "You propose dataset columns to keep for kinetic experiments.",
    "Return ONLY JSON matching this schema:",
    `{"selectedColumns": string[], "columnRoles": {"<column>": "condition|comment|noise"}, "factorCandidates": string[], "notes": string, "uncertainties": string[]}`,
    `Limit selectedColumns to ${MAX_SELECTED_COLUMNS} items and label roles with condition/comment/noise.`,
    `Prefer condition columns and avoid known structural columns: ${payload.knownStructuralColumns.join(", ") || "none"}.`,
    payload.includeComments
      ? "Comments may be selected but must be labeled as comment."
      : "Avoid selecting comment-like columns unless truly necessary; always label them as comment if present.",
    "factorCandidates should be concise (snake_case or lowercase, <=12 items).",
    `Keep notes under ${MAX_NOTES_LENGTH} characters and uncertainties under ${MAX_UNCERTAINTY_LENGTH} characters (max ${MAX_UNCERTAINTIES} items).`,
    "Do not add markdown, explanations, or extra keys."
  ].join(" ");

  const user = JSON.stringify({
    columns: payload.columns,
    experimentCount: payload.experimentCount ?? null,
    knownStructuralColumns: payload.knownStructuralColumns,
    includeComments: payload.includeComments
  });

  return { system, user };
};

export default async function handler(req: any, res: any) {
  const requestId = createRequestId();

  try {
    if (req.method !== "POST") {
      logError(requestId, null, "Method Not Allowed");
      return sendJson(res, 405, {
        ok: false,
        error: "Method Not Allowed",
        requestId
      });
    }

    const parsedBody = await parseBody(req);
    if (!parsedBody.ok) {
      logError(requestId, parsedBody.error, "Invalid request");
      return sendJson(res, 400, { ok: false, error: "Invalid request", requestId });
    }

    const validated = validateRequest(parsedBody.body);
    if (!validated.ok) {
      logError(requestId, null, validated.message);
      return sendJson(res, 400, { ok: false, error: "Invalid request", requestId });
    }

    console.info("[column-scan] start", {
      requestId,
      method: req.method,
      colCount: validated.value.columns.length,
      experimentCount: validated.value.experimentCount ?? null,
      includeComments: validated.value.includeComments
    });

    const keyAvailable = hasOpenAIKey();
    if (!keyAvailable) {
      logError(requestId, null, "Missing OPENAI_API_KEY");
      return sendJson(res, 500, {
        ok: false,
        error: "Missing OPENAI_API_KEY",
        requestId
      });
    }

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const { system, user } = buildPrompt(validated.value);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25_000);

    let rawModelOutput = "";
    try {
      const completion = await openai.chat.completions.create(
        {
          model: "gpt-5.2",
          messages: [
            { role: "system", content: system },
            { role: "user", content: user }
          ],
          temperature: 0,
          max_tokens: 600,
          response_format: { type: "json_object" }
        },
        { signal: controller.signal }
      );
      rawModelOutput = completion.choices?.[0]?.message?.content ?? "";
    } catch (error) {
      logError(requestId, error, "OpenAI call failed");
      return sendJson(res, 502, {
        ok: false,
        error: "Invalid model output",
        requestId,
        details: "OpenAI call failed"
      });
    } finally {
      clearTimeout(timeout);
    }

    let parsedModel: unknown;
    try {
      parsedModel = rawModelOutput ? JSON.parse(rawModelOutput) : null;
    } catch (error) {
      console.error("[column-scan] model parse failure", {
        requestId,
        preview: rawModelOutput.slice(0, 500)
      });
      logError(requestId, error, "Invalid model output");
      return sendJson(res, 502, {
        ok: false,
        error: "Invalid model output",
        requestId,
        details: "JSON parse failed"
      });
    }

    const validatedModel = validateModelResult(parsedModel);
    if (!validatedModel.ok) {
      console.error("[column-scan] model validation failure", {
        requestId,
        preview: rawModelOutput.slice(0, 500)
      });
      return sendJson(res, 502, {
        ok: false,
        error: "Invalid model output",
        requestId,
        details: "Validation failed"
      });
    }

    console.info("[column-scan] success", {
      requestId,
      selectedColumns: validatedModel.value.selectedColumns.length
    });

    return sendJson(res, 200, {
      ok: true,
      requestId,
      result: validatedModel.value
    });
  } catch (error) {
    logError(requestId, error, "Internal Server Error");
    return sendJson(res, 500, {
      ok: false,
      error: "Internal Server Error",
      requestId
    });
  }
}
