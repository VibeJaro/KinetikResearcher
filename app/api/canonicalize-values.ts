import { randomUUID } from "crypto";
import { createChatCompletion, OpenAIError } from "./openai-client";
import type { CanonicalizationResult } from "../src/types/canonicalization";

export const config = {
  runtime: "nodejs"
};

type CanonicalizeRequest = {
  columnName?: unknown;
  values?: unknown;
};

type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; message: string };

type ValidatedRequest = {
  columnName: string;
  values: string[];
};

type ValidatedModel = CanonicalizationResult;

const MAX_VALUES = 300;
const MAX_VALUE_LENGTH = 120;
const MAX_NOTES_LENGTH = 600;
const MAX_UNCERTAINTIES = 12;
const MAX_UNCERTAINTY_LENGTH = 160;

const createRequestId = (): string => {
  try {
    return randomUUID();
  } catch {
    return `req-${Math.random().toString(36).slice(2, 10)}`;
  }
};

const truncateValue = (value: string): string =>
  value.length > MAX_VALUE_LENGTH ? value.slice(0, MAX_VALUE_LENGTH) : value;

const truncateNotes = (value: string): string =>
  value.length > MAX_NOTES_LENGTH ? value.slice(0, MAX_NOTES_LENGTH) : value;

const sanitizeValues = (values: unknown): ValidationResult<string[]> => {
  if (!Array.isArray(values) || values.length === 0 || values.length > MAX_VALUES) {
    return { ok: false, message: "Invalid values" };
  }

  const normalized: string[] = [];
  values.forEach((value) => {
    if (value === null || value === undefined) {
      return;
    }
    if (typeof value === "string") {
      const trimmed = truncateValue(value.trim());
      if (trimmed) {
        normalized.push(trimmed);
      }
      return;
    }
    if (typeof value === "number") {
      normalized.push(truncateValue(value.toString()));
    }
  });

  const unique = Array.from(new Set(normalized));
  if (unique.length === 0) {
    return { ok: false, message: "Invalid values" };
  }

  return { ok: true, value: unique.slice(0, MAX_VALUES) };
};

const validateRequest = (body: unknown): ValidationResult<ValidatedRequest> => {
  if (typeof body !== "object" || body === null) {
    return { ok: false, message: "Invalid request" };
  }
  const payload = body as CanonicalizeRequest;
  const columnName =
    typeof payload.columnName === "string" && payload.columnName.trim().length > 0
      ? truncateValue(payload.columnName.trim())
      : null;
  if (!columnName) {
    return { ok: false, message: "Invalid request" };
  }

  const valuesResult = sanitizeValues(payload.values);
  if (!valuesResult.ok) {
    return { ok: false, message: "Invalid request" };
  }

  return { ok: true, value: { columnName, values: valuesResult.value } };
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

const buildPrompt = (columnName: string, values: string[]): { system: string; user: string } => {
  const system = `You normalize raw metadata values for kinetic experiments.\n` +
    `Return STRICT JSON with canonicalToAliases (Record<string, string[]>), notes, uncertainties.\n` +
    `Rules:\n` +
    `- Every provided raw value must appear exactly once across all alias lists.\n` +
    `- Do not drop or invent values.\n` +
    `- Canonical keys should be concise, chemistry-friendly labels.\n` +
    `- Keep notes short; uncertainties is an array of short bullet strings.\n` +
    `- No markdown, no explanations outside JSON.`;

  const user = `Column: ${columnName}\n` +
    `Values (${values.length}): ${values.join(", ")}`;

  return { system, user };
};

const validateModelResult = (
  data: unknown,
  sourceValues: string[]
): ValidationResult<ValidatedModel> => {
  if (typeof data !== "object" || data === null) {
    return { ok: false, message: "Invalid model output" };
  }
  const payload = data as Partial<CanonicalizationResult>;
  if (!payload.canonicalToAliases || typeof payload.canonicalToAliases !== "object") {
    return { ok: false, message: "Invalid model output" };
  }

  const notes = typeof payload.notes === "string" ? payload.notes.trim() : "";
  const uncertaintiesRaw = Array.isArray(payload.uncertainties)
    ? payload.uncertainties
    : [];
  const uncertainties = uncertaintiesRaw
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
    .slice(0, MAX_UNCERTAINTIES)
    .map((item) => truncateValue(item).slice(0, MAX_UNCERTAINTY_LENGTH));

  const coverage = new Map<string, string>();
  const canonicalToAliases: Record<string, string[]> = {};
  const missing: string[] = [];
  const duplicates: string[] = [];
  const extraneous: string[] = [];

  const canonicalEntries = Object.entries(payload.canonicalToAliases ?? {});
  if (canonicalEntries.length === 0) {
    return { ok: false, message: "Invalid model output" };
  }

  const canonicalNames = canonicalEntries.map(([canonical]) => canonical.trim()).filter(Boolean);
  const duplicateCanonical = canonicalNames.find(
    (name, index) => canonicalNames.indexOf(name) !== index
  );
  if (duplicateCanonical) {
    return { ok: false, message: "Invalid model output" };
  }

  const valueSet = new Set(sourceValues);

  canonicalEntries.forEach(([canonicalKey, aliases]) => {
    const canonical = truncateValue(canonicalKey.trim());
    if (!canonical || !Array.isArray(aliases)) {
      return;
    }
    const sanitizedAliases = Array.from(new Set(
      aliases
        .map((alias) => (typeof alias === "string" ? truncateValue(alias.trim()) : ""))
        .filter(Boolean)
    ));

    canonicalToAliases[canonical] = sanitizedAliases;

    sanitizedAliases.forEach((alias) => {
      if (!valueSet.has(alias)) {
        extraneous.push(alias);
        return;
      }
      if (coverage.has(alias)) {
        duplicates.push(alias);
        return;
      }
      coverage.set(alias, canonical);
    });
  });

  sourceValues.forEach((value) => {
    if (!coverage.has(value)) {
      missing.push(value);
    }
  });

  if (missing.length > 0 || duplicates.length > 0 || extraneous.length > 0) {
    return { ok: false, message: "Coverage failure" };
  }

  return {
    ok: true,
    value: {
      canonicalToAliases,
      notes: truncateNotes(notes),
      uncertainties
    }
  };
};

const logError = (requestId: string, error: unknown, fallbackMessage: string) => {
  const payload =
    error instanceof Error
      ? { message: error.message, stack: error.stack }
      : { message: fallbackMessage, stack: undefined };
  console.error("[canonicalize-values] failure", { requestId, ...payload });
};

export default async function handler(req: any, res: any) {
  const requestId = createRequestId();

  try {
    if (req.method !== "POST") {
      logError(requestId, null, "Method Not Allowed");
      return sendJson(res, 405, { ok: false, error: "Method Not Allowed", requestId });
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

    console.info("[canonicalize-values] start", {
      requestId,
      columnName: validated.value.columnName,
      valueCount: validated.value.values.length
    });

    if (!hasOpenAIKey()) {
      logError(requestId, null, "Missing OPENAI_API_KEY");
      return sendJson(res, 500, {
        ok: false,
        error: "Missing OPENAI_API_KEY",
        requestId
      });
    }

    const { system, user } = buildPrompt(validated.value.columnName, validated.value.values);

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
      max_completion_tokens: 400,
      response_format: { type: "json_object" }
    } as const;

    if (process.env.NODE_ENV !== "production" && "max_tokens" in openAiRequest) {
      throw new Error("max_tokens must not be present in OpenAI request payload");
    }

    try {
      const completion = await createChatCompletion(openAiRequest, controller.signal);
      rawModelOutput = completion.content;
    } catch (error: any) {
      const status =
        error instanceof OpenAIError && typeof error.status === "number"
          ? error.status
          : undefined;
      const message = error instanceof Error ? error.message : "OpenAI call failed";
      console.error("[canonicalize-values] openai failure", {
        requestId,
        status,
        message,
        details: error instanceof OpenAIError ? error.details : undefined,
        stack: error?.stack
      });
      logError(requestId, error, "OpenAI call failed");
      return sendJson(res, 502, {
        ok: false,
        error: "OpenAI call failed",
        requestId,
        details:
          status || (error instanceof OpenAIError && error.details)
            ? `${status ?? ""} ${error.details ?? message}`.trim()
            : message
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
      logError(requestId, error, "Invalid model output");
      return sendJson(res, 502, {
        ok: false,
        error: "Invalid model output",
        requestId,
        details: "JSON parse failed",
        modelOutputPreview: rawModelOutput.slice(0, 500)
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
        details: "Validation failed",
        modelOutputPreview: rawModelOutput.slice(0, 500)
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
    logError(requestId, error, "Internal Server Error");
    return sendJson(res, 500, { ok: false, error: "Internal Server Error", requestId });
  }
}
