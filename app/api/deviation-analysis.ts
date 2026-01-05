import { randomUUID } from "crypto";
import OpenAI from "openai";
import type { DeviationOntologyItem } from "../src/types/deviations";

export const config = { runtime: "nodejs" };

type DeviationRequestBody = {
  experimentId: string;
  experimentName?: string;
  commentColumns: string[];
  parameterColumns: string[];
  commentContext: Record<string, string>;
  parameterEcho: Record<string, string | number | null>;
  ontology: DeviationOntologyItem[];
};

type DeviationModelResult = {
  experimentId: string;
  experimentName?: string;
  observations: {
    category: DeviationOntologyItem["key"];
    snippet: string;
    sourceColumns: string[];
  }[];
};

type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; message: string };

const MAX_COLUMNS = 20;
const MAX_TEXT_LENGTH = 800;
const MAX_OBSERVATIONS = 12;
const MAX_SNIPPET_LENGTH = 220;
const MAX_SOURCE_COLUMNS = 6;

const createRequestId = () => {
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

const parseBody = async (req: any) => {
  try {
    if (req.body !== undefined && req.body !== null) {
      if (typeof req.body === "string") return { ok: true, body: JSON.parse(req.body) };
      if (Buffer.isBuffer(req.body)) return { ok: true, body: JSON.parse(req.body.toString("utf8")) };
      if (typeof req.body === "object") return { ok: true, body: req.body };
    }
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
    }
    const raw = Buffer.concat(chunks).toString("utf8");
    return { ok: true, body: JSON.parse(raw) };
  } catch (error) {
    return { ok: false, error };
  }
};

const truncateText = (value: unknown): string => {
  if (typeof value !== "string") return "";
  if (value.length <= MAX_TEXT_LENGTH) return value;
  return value.slice(0, MAX_TEXT_LENGTH);
};

const sanitizeColumns = (input: unknown): ValidationResult<string[]> => {
  if (!Array.isArray(input) || input.length === 0 || input.length > MAX_COLUMNS) {
    return { ok: false, message: "Invalid column list" };
  }
  const values = input
    .filter((item) => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  if (values.length === 0) return { ok: false, message: "Invalid column list" };
  return { ok: true, value: values };
};

const sanitizeContext = (
  input: unknown,
  maxItems: number
): ValidationResult<Record<string, string>> => {
  if (typeof input !== "object" || input === null) {
    return { ok: false, message: "Invalid context" };
  }
  const entries: Record<string, string> = {};
  const keys = Object.keys(input as Record<string, unknown>);
  if (keys.length > maxItems) return { ok: false, message: "Too many context entries" };
  keys.forEach((key) => {
    const cleanKey = key.trim();
    if (!cleanKey) return;
    const value = truncateText((input as any)[key]);
    if (value) {
      entries[cleanKey] = value;
    }
  });
  return { ok: true, value: entries };
};

const sanitizeParameters = (
  input: unknown,
  maxItems: number
): ValidationResult<Record<string, string | number | null>> => {
  if (typeof input !== "object" || input === null) {
    return { ok: false, message: "Invalid parameters" };
  }
  const entries: Record<string, string | number | null> = {};
  const keys = Object.keys(input as Record<string, unknown>);
  if (keys.length > maxItems) return { ok: false, message: "Too many parameter entries" };
  keys.forEach((key) => {
    const cleanKey = key.trim();
    if (!cleanKey) return;
    const value = (input as any)[key];
    if (typeof value === "string" || typeof value === "number" || value === null) {
      entries[cleanKey] = typeof value === "string" ? truncateText(value) : value;
    }
  });
  return { ok: true, value: entries };
};

const sanitizeOntology = (input: unknown): ValidationResult<DeviationOntologyItem[]> => {
  if (!Array.isArray(input) || input.length === 0) return { ok: false, message: "Invalid ontology" };
  const values: DeviationOntologyItem[] = [];
  for (const entry of input) {
    if (typeof entry !== "object" || entry === null) return { ok: false, message: "Invalid ontology" };
    const key = (entry as any).key;
    const label = (entry as any).label;
    const icon = (entry as any).icon;
    const description = (entry as any).description;
    if (
      typeof key !== "string" ||
      typeof label !== "string" ||
      typeof icon !== "string" ||
      typeof description !== "string"
    ) {
      return { ok: false, message: "Invalid ontology" };
    }
    values.push({ key: key as any, label, icon, description });
  }
  return { ok: true, value: values };
};

const validateRequest = (body: unknown): ValidationResult<DeviationRequestBody> => {
  if (typeof body !== "object" || body === null) return { ok: false, message: "Invalid request" };
  const experimentId = typeof (body as any).experimentId === "string" ? (body as any).experimentId : "";
  if (!experimentId) return { ok: false, message: "Invalid experimentId" };
  const commentColumns = sanitizeColumns((body as any).commentColumns);
  const parameterColumns = sanitizeColumns((body as any).parameterColumns);
  if (!commentColumns.ok || !parameterColumns.ok) return { ok: false, message: "Invalid columns" };
  const commentContext = sanitizeContext((body as any).commentContext, MAX_COLUMNS);
  const parameterEcho = sanitizeParameters((body as any).parameterEcho, MAX_COLUMNS);
  if (!commentContext.ok || !parameterEcho.ok) return { ok: false, message: "Invalid context" };
  const ontology = sanitizeOntology((body as any).ontology);
  if (!ontology.ok) return { ok: false, message: "Invalid ontology" };

  return {
    ok: true,
    value: {
      experimentId,
      experimentName:
        typeof (body as any).experimentName === "string" ? (body as any).experimentName : undefined,
      commentColumns: commentColumns.value,
      parameterColumns: parameterColumns.value,
      commentContext: commentContext.value,
      parameterEcho: parameterEcho.value,
      ontology: ontology.value
    }
  };
};

const validateModelResult = (input: unknown): ValidationResult<DeviationModelResult> => {
  if (typeof input !== "object" || input === null) return { ok: false, message: "Invalid model output" };
  const experimentId = (input as any).experimentId;
  if (typeof experimentId !== "string" || !experimentId.trim()) {
    return { ok: false, message: "Invalid model output" };
  }
  const observations = (input as any).observations;
  if (!Array.isArray(observations) || observations.length > MAX_OBSERVATIONS) {
    return { ok: false, message: "Invalid model output" };
  }

  const normalized: DeviationModelResult["observations"] = [];
  for (const obs of observations) {
    if (typeof obs !== "object" || obs === null) return { ok: false, message: "Invalid model output" };
    const category = (obs as any).category;
    const snippet = typeof (obs as any).snippet === "string" ? (obs as any).snippet.slice(0, MAX_SNIPPET_LENGTH) : "";
    const sourceColumns = Array.isArray((obs as any).sourceColumns)
      ? (obs as any).sourceColumns.filter((c: unknown) => typeof c === "string").slice(0, MAX_SOURCE_COLUMNS)
      : [];
    if (!category || !snippet || sourceColumns.length === 0) return { ok: false, message: "Invalid model output" };
    normalized.push({
      category,
      snippet,
      sourceColumns
    });
  }

  return {
    ok: true,
    value: {
      experimentId,
      experimentName:
        typeof (input as any).experimentName === "string" ? (input as any).experimentName : undefined,
      observations: normalized
    }
  };
};

const buildPrompt = (payload: DeviationRequestBody) => {
  const ontologyItems = payload.ontology
    .map(
      (item, index) =>
        `${index + 1}. ${item.label} (key: ${item.key}) — ${item.description}`
    )
    .join("\n");

  const system = [
    "Du erkennst Auffälligkeiten in Experiment-Kommentaren für kinetische Auswertungen.",
    "Nutze ausschliesslich die folgenden 10 Kategorien. Keine neuen Kategorien erfinden.",
    ontologyItems,
    "Antworte nur als JSON. Kein Freitext, keine Bewertung, keine Korrekturvorschläge.",
    `Max ${MAX_OBSERVATIONS} Beobachtungen. Jede Beobachtung braucht category, snippet, sourceColumns.`,
    "category muss der key aus der Liste sein. snippet muss Originaltext aus dem Kommentar sein.",
    "Wenn keine Auffälligkeit erkennbar ist, gib ein leeres observations-Array zurück."
  ].join("\n");

  const user = JSON.stringify({
    experimentId: payload.experimentId,
    experimentName: payload.experimentName ?? null,
    commentContext: payload.commentContext,
    parameterEcho: payload.parameterEcho,
    ontologyKeys: payload.ontology.map((item) => item.key)
  });

  return { system, user };
};

const hasOpenAIKey = () =>
  typeof process.env.OPENAI_API_KEY === "string" && process.env.OPENAI_API_KEY.trim() !== "";

export default async function handler(req: any, res: any) {
  const requestId = createRequestId();
  if (req.method !== "POST") {
    return sendJson(res, 405, { ok: false, error: "Method Not Allowed", requestId });
  }

  const parsed = await parseBody(req);
  if (!parsed.ok) {
    return sendJson(res, 400, { ok: false, error: "Invalid request", requestId });
  }

  const validated = validateRequest(parsed.body);
  if (!validated.ok) {
    return sendJson(res, 400, { ok: false, error: "Invalid request", requestId });
  }

  if (!hasOpenAIKey()) {
    return sendJson(res, 500, { ok: false, error: "Missing OPENAI_API_KEY", requestId });
  }

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
    response_format: { type: "json_object" }
  } as const;

  try {
    const completion = await openai.chat.completions.create(openAiRequest, {
      signal: controller.signal
    });
    rawModelOutput = completion.choices?.[0]?.message?.content ?? "";
  } catch (error: any) {
    clearTimeout(timeout);
    return sendJson(res, 502, {
      ok: false,
      error: "OpenAI call failed",
      requestId,
      details: error?.message ?? "OpenAI call failed",
      debug: { modelInput: { system, user }, modelOutput: rawModelOutput.slice(0, 2000) }
    });
  } finally {
    clearTimeout(timeout);
  }

  let parsedModel: unknown;
  try {
    parsedModel = rawModelOutput ? JSON.parse(rawModelOutput) : null;
  } catch (error) {
    return sendJson(res, 502, {
      ok: false,
      error: "Invalid model output",
      requestId,
      modelOutputPreview: rawModelOutput.slice(0, 500),
      debug: { modelInput: { system, user }, modelOutput: rawModelOutput.slice(0, 2000) }
    });
  }

  const validatedModel = validateModelResult(parsedModel);
  if (!validatedModel.ok) {
    return sendJson(res, 502, {
      ok: false,
      error: "Invalid model output",
      requestId,
      modelOutputPreview: rawModelOutput.slice(0, 500),
      debug: { modelInput: { system, user }, modelOutput: rawModelOutput.slice(0, 2000) }
    });
  }

  const result: DeviationModelResult = {
    experimentId: validatedModel.value.experimentId,
    experimentName: validatedModel.value.experimentName,
    observations: validatedModel.value.observations
  };

  return sendJson(res, 200, {
    ok: true,
    requestId,
    result,
    debug: {
      modelInput: { system, user },
      modelOutput: rawModelOutput.slice(0, 2000)
    }
  });
}
