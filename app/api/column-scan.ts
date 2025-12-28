import { randomUUID } from "crypto";
import OpenAI from "openai";

export const config = {
  runtime: "nodejs"
};

type ColumnTypeHeuristic = "numeric" | "text" | "mixed";
type ColumnInput = {
  name: string;
  typeHeuristic: ColumnTypeHeuristic;
  nonNullRatio: number;
  examples: string[];
};
type ColumnScanRequest = {
  columns: ColumnInput[];
  experimentCount?: number;
  knownStructuralColumns?: string[];
  includeComments: boolean;
};
type ColumnScanResult = {
  selectedColumns: string[];
  columnRoles: Record<string, "condition" | "comment" | "noise">;
  factorCandidates: string[];
  notes: string;
  uncertainties: string[];
};

type ParsedBody =
  | { ok: true; body: unknown }
  | { ok: false; error?: unknown; body?: undefined };

const MAX_COLUMNS = 500;
const MAX_EXAMPLES = 10;
const REQUEST_TIMEOUT_MS = 25_000;

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

const logFailure = (requestId: string, error: unknown, message: string) => {
  const meta =
    error instanceof Error
      ? { message: error.message, stack: error.stack }
      : { message, stack: undefined };
  console.error("[column-scan] failure", { requestId, ...meta });
};

const parseJsonBody = async (req: any): Promise<ParsedBody> => {
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
      chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
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

const normalizeExamples = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  const examples: string[] = [];
  for (const entry of value) {
    if (examples.length >= MAX_EXAMPLES) {
      break;
    }
    if (entry === null || entry === undefined) {
      continue;
    }
    const text =
      typeof entry === "string"
        ? entry
        : typeof entry === "number"
          ? entry.toString()
          : String(entry);
    const trimmed = text.trim();
    if (trimmed) {
      examples.push(trimmed.slice(0, 120));
    }
  }
  return examples;
};

const validateColumns = (input: unknown): ColumnInput[] | null => {
  if (!Array.isArray(input) || input.length === 0 || input.length > MAX_COLUMNS) {
    return null;
  }
  const columns: ColumnInput[] = [];
  for (const entry of input) {
    if (typeof entry !== "object" || entry === null) {
      return null;
    }
    const name = typeof (entry as any).name === "string" ? (entry as any).name.trim() : "";
    const typeHeuristic = (entry as any).typeHeuristic;
    const nonNullRatio = (entry as any).nonNullRatio;
    if (!name) {
      return null;
    }
    if (typeHeuristic !== "numeric" && typeHeuristic !== "text" && typeHeuristic !== "mixed") {
      return null;
    }
    if (typeof nonNullRatio !== "number" || Number.isNaN(nonNullRatio)) {
      return null;
    }
    if (nonNullRatio < 0 || nonNullRatio > 1) {
      return null;
    }
    const examples = normalizeExamples((entry as any).examples ?? []);
    columns.push({ name, typeHeuristic, nonNullRatio, examples });
  }
  return columns;
};

const validateRequestBody = (
  body: unknown
): { ok: true; payload: ColumnScanRequest } | { ok: false } => {
  if (typeof body !== "object" || body === null) {
    return { ok: false };
  }
  const columns = validateColumns((body as any).columns);
  if (!columns) {
    return { ok: false };
  }
  const experimentCountValue = (body as any).experimentCount;
  if (
    experimentCountValue !== undefined &&
    (typeof experimentCountValue !== "number" || Number.isNaN(experimentCountValue))
  ) {
    return { ok: false };
  }
  const knownStructuralColumnsValue = (body as any).knownStructuralColumns;
  let knownStructuralColumns: string[] | undefined;
  if (knownStructuralColumnsValue !== undefined) {
    if (
      !Array.isArray(knownStructuralColumnsValue) ||
      knownStructuralColumnsValue.some((entry) => typeof entry !== "string")
    ) {
      return { ok: false };
    }
    knownStructuralColumns = (knownStructuralColumnsValue as string[])
      .map((value) => value.trim())
      .filter(Boolean);
  }
  const includeComments = (body as any).includeComments === true;
  return {
    ok: true,
    payload: {
      columns,
      experimentCount:
        typeof experimentCountValue === "number" ? (experimentCountValue as number) : undefined,
      knownStructuralColumns,
      includeComments
    }
  };
};

const buildUserPayload = (payload: ColumnScanRequest) => ({
  columns: payload.columns,
  experimentCount: payload.experimentCount ?? null,
  knownStructuralColumns: payload.knownStructuralColumns ?? [],
  includeComments: payload.includeComments
});

const callModel = async ({
  payload,
  signal
}: {
  payload: ColumnScanRequest;
  signal: AbortSignal;
}): Promise<string> => {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const completion = await client.chat.completions.create({
    model: "gpt-5.2",
    temperature: 0.2,
    max_tokens: 500,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "You propose column selections for kinetic datasets. Respond with JSON only, never markdown. Use exactly these keys: selectedColumns (<=8 items), columnRoles (values: condition|comment|noise), factorCandidates (<=12, lower-case preferred), notes (<=400 chars), uncertainties (<=8, each <=160 chars). Avoid known structural columns unless unavoidable. Prefer condition-like signals. Respect includeComments=false: only include comment-like columns if essential and mark them as comment."
      },
      {
        role: "user",
        content: `Input: ${JSON.stringify(buildUserPayload(payload))}`
      }
    ],
    signal
  });
  const content = completion.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("Empty model response");
  }
  return content;
};

const validateModelOutput = (
  raw: unknown
): { ok: true; result: ColumnScanResult } | { ok: false; reason: string } => {
  if (typeof raw !== "object" || raw === null) {
    return { ok: false, reason: "Model output is not an object" };
  }
  const allowedKeys = ["selectedColumns", "columnRoles", "factorCandidates", "notes", "uncertainties"];
  const extraKeys = Object.keys(raw as Record<string, unknown>).filter(
    (key) => !allowedKeys.includes(key)
  );
  if (extraKeys.length > 0) {
    return { ok: false, reason: `Unexpected keys: ${extraKeys.join(", ")}` };
  }

  const selectedColumns = (raw as any).selectedColumns;
  if (
    !Array.isArray(selectedColumns) ||
    selectedColumns.some((item) => typeof item !== "string") ||
    selectedColumns.length > 8
  ) {
    return { ok: false, reason: "Invalid selectedColumns" };
  }

  const columnRoles = (raw as any).columnRoles;
  const allowedRoles = new Set(["condition", "comment", "noise"]);
  if (
    typeof columnRoles !== "object" ||
    columnRoles === null ||
    Object.values(columnRoles).some((value) => !allowedRoles.has(value as string))
  ) {
    return { ok: false, reason: "Invalid columnRoles" };
  }

  const factorCandidates = (raw as any).factorCandidates;
  if (
    !Array.isArray(factorCandidates) ||
    factorCandidates.some((item) => typeof item !== "string") ||
    factorCandidates.length > 12
  ) {
    return { ok: false, reason: "Invalid factorCandidates" };
  }

  const notes = (raw as any).notes;
  if (typeof notes !== "string" || notes.length > 400) {
    return { ok: false, reason: "Invalid notes" };
  }

  const uncertainties = (raw as any).uncertainties;
  if (
    !Array.isArray(uncertainties) ||
    uncertainties.some((item) => typeof item !== "string" || item.length > 160) ||
    uncertainties.length > 8
  ) {
    return { ok: false, reason: "Invalid uncertainties" };
  }

  return {
    ok: true,
    result: {
      selectedColumns,
      columnRoles,
      factorCandidates,
      notes,
      uncertainties
    }
  };
};

export default async function handler(req: any, res: any) {
  const requestId = createRequestId();

  let parsedBody: ParsedBody | null = null;
  let startLog = {
    requestId,
    method: req.method ?? "UNKNOWN",
    colCount: null as number | null,
    experimentCount: null as number | null,
    includeComments: false
  };

  try {
    parsedBody = await parseJsonBody(req);
    if (parsedBody.ok && typeof parsedBody.body === "object" && parsedBody.body !== null) {
      const body: any = parsedBody.body;
      startLog = {
        ...startLog,
        colCount: Array.isArray(body.columns) ? body.columns.length : null,
        experimentCount: typeof body.experimentCount === "number" ? body.experimentCount : null,
        includeComments: body.includeComments === true
      };
    }
  } catch {
    // ignore logging parse errors here; handled below
  }

  console.info("[column-scan] start", startLog);

  if (req.method !== "POST") {
    logFailure(requestId, null, "Method Not Allowed");
    return sendJson(res, 405, { ok: false, error: "Method Not Allowed", requestId });
  }

  if (!parsedBody || !parsedBody.ok) {
    logFailure(requestId, parsedBody?.error ?? null, "Invalid request");
    return sendJson(res, 400, { ok: false, error: "Invalid request", requestId });
  }

  const validation = validateRequestBody(parsedBody.body);
  if (!validation.ok) {
    logFailure(requestId, null, "Invalid request");
    return sendJson(res, 400, { ok: false, error: "Invalid request", requestId });
  }
  const payload = validation.payload;

  if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY.trim() === "") {
    logFailure(requestId, null, "Missing OPENAI_API_KEY");
    return sendJson(res, 500, { ok: false, error: "Missing OPENAI_API_KEY", requestId });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const rawContent = await callModel({ payload, signal: controller.signal });
    let parsedOutput: unknown;
    try {
      parsedOutput = JSON.parse(rawContent);
    } catch (error) {
      console.error("[column-scan] model-output", {
        requestId,
        preview: rawContent.slice(0, 500)
      });
      throw new Error("Invalid model JSON");
    }

    const validated = validateModelOutput(parsedOutput);
    if (!validated.ok) {
      console.error("[column-scan] model-output", {
        requestId,
        preview: typeof rawContent === "string" ? rawContent.slice(0, 500) : ""
      });
      logFailure(requestId, null, validated.reason);
      return sendJson(res, 502, {
        ok: false,
        error: "Invalid model output",
        requestId,
        details: validated.reason
      });
    }

    console.info("[column-scan] success", {
      requestId,
      selectedCount: validated.result.selectedColumns.length
    });
    return sendJson(res, 200, {
      ok: true,
      requestId,
      result: validated.result
    });
  } catch (error) {
    const message =
      error instanceof Error && error.name === "AbortError"
        ? "OpenAI call timed out"
        : "OpenAI call failed";
    logFailure(requestId, error, message);
    return sendJson(res, 502, {
      ok: false,
      error: message,
      requestId
    });
  } finally {
    clearTimeout(timeout);
  }
}
