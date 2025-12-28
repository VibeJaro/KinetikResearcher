import { randomUUID } from "crypto";
import OpenAI from "openai";

import type { CanonicalizationSuccessResponse } from "../src/types/canonicalization";

export const config = {
  runtime: "nodejs"
};

type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; message: string };

type ValidatedRequest = {
  columnName: string;
  values: string[];
};

const MAX_VALUES = 300;
const MAX_VALUE_LENGTH = 120;
const MAX_NOTES_LENGTH = 800;
const MAX_UNCERTAINTIES = 20;
const MAX_UNCERTAINTY_LENGTH = 200;

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

const sanitizeValue = (value: unknown): string | null => {
  if (typeof value === "string") {
    return value.trim().slice(0, MAX_VALUE_LENGTH);
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value).slice(0, MAX_VALUE_LENGTH);
  }
  return null;
};

const validateRequest = (body: unknown): ValidationResult<ValidatedRequest> => {
  if (typeof body !== "object" || body === null) {
    return { ok: false, message: "Invalid request" };
  }
  const columnName = typeof (body as any).columnName === "string" ? (body as any).columnName.trim() : "";
  const values = (body as any).values;

  if (!columnName) {
    return { ok: false, message: "Invalid request" };
  }
  if (!Array.isArray(values) || values.length === 0 || values.length > MAX_VALUES) {
    return { ok: false, message: "Invalid request" };
  }

  const sanitized = values
    .map((entry) => sanitizeValue(entry))
    .filter((entry): entry is string => typeof entry === "string" && entry.length > 0);

  if (sanitized.length === 0 || sanitized.length > MAX_VALUES) {
    return { ok: false, message: "Invalid request" };
  }

  return {
    ok: true,
    value: {
      columnName,
      values: sanitized
    }
  };
};

const hasOpenAIKey = (): boolean =>
  typeof process.env.OPENAI_API_KEY === "string" && process.env.OPENAI_API_KEY.trim() !== "";

const buildPrompt = (payload: ValidatedRequest): { system: string; user: string } => {
  const system = [
    "You normalize raw metadata values into canonical buckets for scientific experiments.",
    'Return ONLY JSON like {"canonicalToAliases": {"<canonical>": ["alias1", "alias2"]}, "notes": string, "uncertainties": string[]}.',
    "Hard requirement: every input value must appear exactly once across aliases (no missing, no duplicates).",
    `Do not invent values; use only the provided raw values for aliases. Keep responses concise. Limit notes to ${MAX_NOTES_LENGTH} characters and uncertainties to ${MAX_UNCERTAINTIES} entries of max ${MAX_UNCERTAINTY_LENGTH} characters.`,
    "Avoid markdown or extra keys."
  ].join(" ");

  const user = JSON.stringify({
    columnName: payload.columnName,
    values: payload.values
  });

  return { system, user };
};

const validateModelResult = (
  data: unknown,
  inputValues: string[]
): ValidationResult<CanonicalizationSuccessResponse["result"]> => {
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

  const normalizedMapping: Record<string, string[]> = {};
  const knownValues = new Set(inputValues);
  const seenValues = new Set<string>();
  for (const [canonicalRaw, aliasesRaw] of Object.entries(canonicalToAliases)) {
    const canonical = typeof canonicalRaw === "string" ? canonicalRaw.trim().slice(0, MAX_VALUE_LENGTH) : "";
    if (!canonical || !Array.isArray(aliasesRaw)) {
      return { ok: false, message: "Invalid model output" };
    }

    const normalizedAliases: string[] = [];
    for (const aliasRaw of aliasesRaw) {
      const alias = sanitizeValue(aliasRaw);
      if (!alias) {
        return { ok: false, message: "Invalid model output" };
      }
      if (!knownValues.has(alias)) {
        return { ok: false, message: "Invalid model output" };
      }
      if (seenValues.has(alias)) {
        return { ok: false, message: "Invalid model output" };
      }
      seenValues.add(alias);
      normalizedAliases.push(alias);
    }
    if (normalizedAliases.length === 0) {
      return { ok: false, message: "Invalid model output" };
    }
    normalizedMapping[canonical] = normalizedAliases;
  }

  if (seenValues.size !== knownValues.size) {
    return { ok: false, message: "Invalid model output" };
  }

  if (notes !== undefined && (typeof notes !== "string" || notes.length > MAX_NOTES_LENGTH)) {
    return { ok: false, message: "Invalid model output" };
  }

  if (
    uncertainties !== undefined &&
    (!Array.isArray(uncertainties) ||
      uncertainties.length > MAX_UNCERTAINTIES ||
      uncertainties.some(
        (entry) => typeof entry !== "string" || entry.length === 0 || entry.length > MAX_UNCERTAINTY_LENGTH
      ))
  ) {
    return { ok: false, message: "Invalid model output" };
  }

  return {
    ok: true,
    value: {
      canonicalToAliases: normalizedMapping,
      notes: typeof notes === "string" ? notes : undefined,
      uncertainties:
        Array.isArray(uncertainties) && uncertainties.length > 0
          ? (uncertainties as string[])
          : undefined
    }
  };
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
      return sendJson(res, 400, {
        ok: false,
        error: "Invalid request",
        requestId,
        details: validated.message
      });
    }

    console.info("[canonicalize-values] start", {
      requestId,
      columnName: validated.value.columnName,
      valueCount: validated.value.values.length,
      preview: validated.value.values.slice(0, 5)
    });

    if (!hasOpenAIKey()) {
      return sendJson(res, 500, { ok: false, error: "Missing OPENAI_API_KEY", requestId });
    }

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const { system, user } = buildPrompt(validated.value);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25_000);

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

    let rawModelOutput = "";
    try {
      const completion = await openai.chat.completions.create(
        openAiRequest,
        { signal: controller.signal }
      );
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
        details: validatedModel.message
      });
      return sendJson(res, 502, {
        ok: false,
        error: "Invalid model output",
        requestId,
        details: validatedModel.message
      });
    }

    console.info("[canonicalize-values] success", {
      requestId,
      canonicalCount: Object.keys(validatedModel.value.canonicalToAliases).length
    });

    return sendJson(res, 200, {
      ok: true,
      requestId,
      result: validatedModel.value
    });
  } catch (error) {
    console.error("[canonicalize-values] failure", { requestId, error });
    return sendJson(res, 500, { ok: false, error: "Internal Server Error", requestId });
  }
}

