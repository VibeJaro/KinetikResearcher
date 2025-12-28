import { randomUUID } from "crypto";
import { loadOpenAI } from "./utils/loadOpenAI";

export const config = {
  runtime: "nodejs"
};

type CanonicalizationSuccessResponse = {
  ok: true;
  requestId: string;
  result: {
    canonicalToAliases: Record<string, string[]>;
    notes?: string;
    uncertainties?: string[];
  };
};

type CanonicalizationErrorResponse = {
  ok: false;
  requestId: string;
  error: string;
  details?: string;
};

type CanonicalizationResponse =
  | CanonicalizationSuccessResponse
  | CanonicalizationErrorResponse;

type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; message: string };

type CanonicalizationRequest = {
  columnName: string;
  values: string[];
};

type ValidatedRequest = CanonicalizationRequest;

type ModelResult = CanonicalizationSuccessResponse["result"];

const MAX_VALUE_LENGTH = 120;
const MAX_VALUES = 300;
const MAX_NOTES_LENGTH = 600;
const MAX_UNCERTAINTY_LENGTH = 200;
const MAX_UNCERTAINTIES = 20;

const createRequestId = (): string => {
  try {
    return randomUUID();
  } catch {
    return `req-${Math.random().toString(36).slice(2, 10)}`;
  }
};

const sendJson = (res: any, statusCode: number, payload: CanonicalizationResponse) => {
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

const hasOpenAIKey = (): boolean =>
  typeof process.env.OPENAI_API_KEY === "string" && process.env.OPENAI_API_KEY.trim() !== "";

const sanitizeValues = (values: unknown): ValidationResult<string[]> => {
  if (!Array.isArray(values) || values.length === 0 || values.length > MAX_VALUES) {
    return { ok: false, message: "Invalid values" };
  }
  const sanitized: string[] = [];
  for (const value of values) {
    if (typeof value !== "string" && typeof value !== "number") {
      continue;
    }
    const normalized = String(value).trim().slice(0, MAX_VALUE_LENGTH);
    if (normalized.length === 0) {
      continue;
    }
    if (!sanitized.includes(normalized)) {
      sanitized.push(normalized);
    }
  }
  if (sanitized.length === 0) {
    return { ok: false, message: "Invalid values" };
  }
  return { ok: true, value: sanitized };
};

const validateRequest = (body: unknown): ValidationResult<ValidatedRequest> => {
  if (typeof body !== "object" || body === null) {
    return { ok: false, message: "Invalid request" };
  }
  const columnName =
    typeof (body as any).columnName === "string"
      ? (body as any).columnName.trim()
      : "";
  const valuesResult = sanitizeValues((body as any).values);
  if (!columnName) {
    return { ok: false, message: "Invalid request" };
  }
  if (!valuesResult.ok) {
    return { ok: false, message: "Invalid request" };
  }

  return { ok: true, value: { columnName, values: valuesResult.value } };
};

const validateModelResult = (
  data: unknown,
  expectedValues: string[]
): ValidationResult<ModelResult> => {
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

  const normalizedCanonicalToAliases: Record<string, string[]> = {};
  const coverage = new Map<string, string>();
  for (const [canonicalRaw, aliasesRaw] of Object.entries(canonicalToAliases)) {
    const canonical = canonicalRaw.trim();
    if (!canonical || !Array.isArray(aliasesRaw)) {
      return { ok: false, message: "Invalid model output" };
    }
    const aliases = (aliasesRaw as unknown[])
      .filter((alias) => typeof alias === "string")
      .map((alias) => (alias as string).trim().slice(0, MAX_VALUE_LENGTH))
      .filter((alias) => alias.length > 0);
    normalizedCanonicalToAliases[canonical] = aliases;

    for (const alias of aliases) {
      if (coverage.has(alias)) {
        return { ok: false, message: "Invalid model output" };
      }
      coverage.set(alias, canonical);
    }
  }

  const expectedSet = new Set(expectedValues);
  for (const value of expectedSet) {
    if (!coverage.has(value)) {
      return { ok: false, message: "Invalid model output" };
    }
  }
  if (coverage.size !== expectedSet.size) {
    return { ok: false, message: "Invalid model output" };
  }

  if (notes !== undefined && (typeof notes !== "string" || notes.length > MAX_NOTES_LENGTH)) {
    return { ok: false, message: "Invalid model output" };
  }

  if (uncertainties !== undefined) {
    if (!Array.isArray(uncertainties) || uncertainties.length > MAX_UNCERTAINTIES) {
      return { ok: false, message: "Invalid model output" };
    }
    for (const item of uncertainties) {
      if (typeof item !== "string" || item.length === 0 || item.length > MAX_UNCERTAINTY_LENGTH) {
        return { ok: false, message: "Invalid model output" };
      }
    }
  }

  return {
    ok: true,
    value: {
      canonicalToAliases: normalizedCanonicalToAliases,
      notes: notes ?? undefined,
      uncertainties: uncertainties ?? undefined
    }
  };
};

const buildPrompt = (payload: ValidatedRequest): { system: string; user: string } => {
  const system = [
    "You normalize experimental column values into canonical groups.",
    "Return ONLY JSON with keys {\"canonicalToAliases\": Record<string, string[]>, \"notes\"?: string, \"uncertainties\"?: string[]}.",
    "Each canonical key should be concise and human-readable.",
    "Every input value must appear exactly once in aliases across all canonicals (no missing, no duplicates).",
    "Do not invent new raw values. Avoid markdown or extra text."
  ].join(" ");

  const user = JSON.stringify({
    columnName: payload.columnName,
    values: payload.values
  });

  return { system, user };
};

export default async function handler(req: any, res: any) {
  const requestId = createRequestId();

  try {
    if (req.method !== "POST") {
      return sendJson(res, 405, {
        ok: false,
        error: "Method Not Allowed",
        requestId
      });
    }

    const parsedBody = await parseBody(req);
    if (!parsedBody.ok) {
      return sendJson(res, 400, { ok: false, error: "Invalid request", requestId });
    }

    const validated = validateRequest(parsedBody.body);
    if (!validated.ok) {
      return sendJson(res, 400, { ok: false, error: "Invalid request", requestId });
    }

    console.info("[canonicalize-values] start", {
      requestId,
      columnName: validated.value.columnName,
      valueCount: validated.value.values.length,
      preview: validated.value.values.slice(0, 5)
    });

    if (!hasOpenAIKey()) {
      return sendJson(res, 500, {
        ok: false,
        error: "Missing OPENAI_API_KEY",
        requestId
      });
    }

    const OpenAI = await loadOpenAI();
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const { system, user } = buildPrompt(validated.value);

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
      max_completion_tokens: 800,
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
        details: status ? `${status} ${message}` : message
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
        details: "JSON parse failed"
      });
    }

    const validatedModel = validateModelResult(parsedModel, validated.value.values);
    if (!validatedModel.ok) {
      console.error("[canonicalize-values] model validation failure", {
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

    console.info("[canonicalize-values] success", {
      requestId,
      canonicalGroups: Object.keys(validatedModel.value.canonicalToAliases).length
    });

    return sendJson(res, 200, {
      ok: true,
      requestId,
      result: validatedModel.value
    });
  } catch (error) {
    console.error("[canonicalize-values] unexpected failure", {
      requestId,
      message: error instanceof Error ? error.message : "Unknown error",
      stack: (error as any)?.stack
    });
    return sendJson(res, 500, {
      ok: false,
      error: "Internal Server Error",
      requestId
    });
  }
}
