import { randomUUID } from "crypto";
import OpenAI from "openai";

export const config = {
  runtime: "nodejs"
};

type CanonicalizationResult = {
  canonicalToAliases: Record<string, string[]>;
  notes: string;
  uncertainties: string[];
};

type ValidationResult<T> = { ok: true; value: T } | { ok: false; message: string };

const MAX_VALUES = 300;
const MAX_VALUE_LENGTH = 120;
const MAX_NOTES_LENGTH = 600;
const MAX_UNCERTAINTIES = 20;
const MAX_UNCERTAINTY_LENGTH = 160;
const MAX_CANONICAL_LENGTH = 80;

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

const hasOpenAIKey = (): boolean =>
  typeof process.env.OPENAI_API_KEY === "string" && process.env.OPENAI_API_KEY.trim() !== "";

const sanitizeValues = (values: unknown): ValidationResult<string[]> => {
  if (!Array.isArray(values) || values.length === 0 || values.length > MAX_VALUES) {
    return { ok: false, message: "Invalid values" };
  }
  const normalized = values
    .map((value) => {
      if (typeof value === "number") {
        return Number.isFinite(value) ? value.toString() : "";
      }
      if (typeof value === "string") {
        return value.trim();
      }
      return "";
    })
    .map((value) => (value.length > MAX_VALUE_LENGTH ? value.slice(0, MAX_VALUE_LENGTH) : value))
    .filter((value) => value.length > 0);

  if (normalized.length === 0) {
    return { ok: false, message: "Invalid values" };
  }

  return { ok: true, value: Array.from(new Set(normalized)) };
};

const validateRequest = (body: unknown): ValidationResult<{ columnName: string; values: string[] }> => {
  if (typeof body !== "object" || body === null) {
    return { ok: false, message: "Invalid request" };
  }
  const columnName =
    typeof (body as any).columnName === "string" ? (body as any).columnName.trim() : "";
  const valuesResult = sanitizeValues((body as any).values);
  if (!columnName || !valuesResult.ok) {
    return { ok: false, message: "Invalid request" };
  }
  return { ok: true, value: { columnName, values: valuesResult.value } };
};

const validateModelResult = (
  data: unknown,
  sourceValues: string[]
): ValidationResult<CanonicalizationResult> => {
  if (typeof data !== "object" || data === null) {
    return { ok: false, message: "Invalid model output" };
  }
  const { canonicalToAliases, notes, uncertainties, ...rest } = data as any;
  if (Object.keys(rest ?? {}).length > 0) {
    return { ok: false, message: "Invalid model output" };
  }
  if (typeof canonicalToAliases !== "object" || canonicalToAliases === null) {
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

  const normalizedCanonical: Record<string, string[]> = {};
  const aliasAssignments = new Map<string, string>();
  for (const [canonicalRaw, aliasesRaw] of Object.entries(canonicalToAliases)) {
    const canonical = canonicalRaw.trim();
    if (!canonical || canonical.length > MAX_CANONICAL_LENGTH) {
      return { ok: false, message: "Invalid model output" };
    }
    if (!Array.isArray(aliasesRaw) || aliasesRaw.length === 0) {
      return { ok: false, message: "Invalid model output" };
    }
    const normalizedAliases: string[] = [];
    for (const alias of aliasesRaw) {
      if (typeof alias !== "string") {
        return { ok: false, message: "Invalid model output" };
      }
      const trimmed = alias.trim();
      if (!trimmed) {
        return { ok: false, message: "Invalid model output" };
      }
      if (aliasAssignments.has(trimmed)) {
        return { ok: false, message: "Invalid model output" };
      }
      aliasAssignments.set(trimmed, canonical);
      normalizedAliases.push(trimmed);
    }
    normalizedCanonical[canonical] = normalizedAliases;
  }

  if (aliasAssignments.size !== sourceValues.length) {
    return { ok: false, message: "Invalid model output" };
  }
  for (const value of sourceValues) {
    if (!aliasAssignments.has(value)) {
      return { ok: false, message: "Invalid model output" };
    }
  }

  return { ok: true, value: { canonicalToAliases: normalizedCanonical, notes, uncertainties } };
};

const buildPrompt = (columnName: string, values: string[]): { system: string; user: string } => {
  const system = [
    "You map raw experimental metadata values to concise canonical forms.",
    "Return ONLY JSON with keys: canonicalToAliases (record), notes (string), uncertainties (string[]).",
    "Every input value must appear exactly once in some alias list; no duplicates across groups.",
    "Canonical keys should be short and chemically meaningful; avoid comments or verbose phrases.",
    "Alias lists should preserve original strings; keep grouping tight.",
    "Limit notes to short rationale and uncertainties to brief bullets (<=20)."
  ].join(" ");

  const user = JSON.stringify({
    columnName,
    values
  });

  return { system, user };
};

export default async function handler(req: any, res: any) {
  const requestId = createRequestId();
  try {
    if (req.method !== "POST") {
      return sendJson(res, 405, { ok: false, error: "Method Not Allowed", requestId });
    }

    const parsedBody = await parseBody(req);
    if (!parsedBody.ok) {
      return sendJson(res, 400, { ok: false, error: "Invalid request", requestId });
    }

    const validated = validateRequest(parsedBody.body);
    if (!validated.ok) {
      return sendJson(res, 400, { ok: false, error: "Invalid request", requestId });
    }

    const { columnName, values } = validated.value;
    console.info("[canonicalize-values] start", {
      requestId,
      columnName,
      valueCount: values.length
    });

    if (!hasOpenAIKey()) {
      return sendJson(res, 500, { ok: false, error: "Missing OPENAI_API_KEY", requestId });
    }

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const { system, user } = buildPrompt(columnName, values);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25_000);

    let rawModelOutput = "";
    const openAiRequest = {
      model: "gpt-5.2",
      messages: [
        { role: "system", content: system },
        { role: "user", content: user }
      ],
      temperature: 0,
      max_completion_tokens: 600,
      response_format: { type: "json_object" }
    } as const;

    if (process.env.NODE_ENV !== "production" && "max_tokens" in openAiRequest) {
      throw new Error("max_tokens must not be present in OpenAI request payload");
    }

    try {
      const completion = await openai.chat.completions.create(openAiRequest, {
        signal: controller.signal
      });
      rawModelOutput = completion.choices?.[0]?.message?.content ?? "";
    } catch (error: any) {
      const status = typeof error?.status === "number" ? error.status : undefined;
      const message = error instanceof Error ? error.message : "OpenAI call failed";
      console.error("[canonicalize-values] openai failure", {
        requestId,
        status,
        message,
        stack: error?.stack
      });
      return sendJson(res, 502, {
        ok: false,
        error: "OpenAI call failed",
        requestId,
        details: status ? `${status} ${message}` : message,
        debug: { modelInput: { system, user }, modelOutput: rawModelOutput.slice(0, 2000) }
      });
    } finally {
      clearTimeout(timeout);
    }

    let parsedModel: unknown;
    try {
      parsedModel = rawModelOutput ? JSON.parse(rawModelOutput) : null;
    } catch (error) {
      console.error("[canonicalize-values] model parse failure", {
        requestId,
        preview: rawModelOutput.slice(0, 500)
      });
      return sendJson(res, 502, {
        ok: false,
        error: "Invalid model output",
        requestId,
        details: "JSON parse failed",
        modelOutputPreview: rawModelOutput.slice(0, 500),
        debug: { modelInput: { system, user }, modelOutput: rawModelOutput.slice(0, 2000) }
      });
    }

    const validatedModel = validateModelResult(parsedModel, values);
    if (!validatedModel.ok) {
      console.error("[canonicalize-values] model validation failure", {
        requestId,
        preview: rawModelOutput.slice(0, 500)
      });
      return sendJson(res, 502, {
        ok: false,
        error: "Invalid model output",
        requestId,
        details: "Validation failed",
        modelOutputPreview: rawModelOutput.slice(0, 500),
        debug: { modelInput: { system, user }, modelOutput: rawModelOutput.slice(0, 2000) }
      });
    }

    console.info("[canonicalize-values] success", {
      requestId,
      columnName,
      valueCount: values.length
    });

    return sendJson(res, 200, {
      ok: true,
      requestId,
      result: validatedModel.value
    });
  } catch (error) {
    console.error("[canonicalize-values] unexpected failure", { requestId, error });
    return sendJson(res, 500, { ok: false, error: "Internal Server Error", requestId });
  }
}
