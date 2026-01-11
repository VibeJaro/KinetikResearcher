import { randomUUID } from "crypto";
import OpenAI from "openai";

export const config = {
  runtime: "nodejs"
};

type ColumnEvidence = {
  column: string;
  values: string[];
};

type ContextEvidence = {
  column: string;
  snippets: string[];
};

type RepresentativityScanRequest = {
  experimentId: string;
  experimentName?: string;
  referenceColumns: ColumnEvidence[];
  contextColumns: ContextEvidence[];
};

type RepresentativityFinding = {
  category:
    | "material_mismatch"
    | "temperature_mismatch"
    | "concentration_mismatch"
    | "batch_or_charge_note"
    | "procedure_variant"
    | "other_inconsistency";
  snippet: string;
  sourceColumn: string;
  note?: string;
};

type RepresentativityScanModelResult = {
  experimentId: string;
  experimentName?: string;
  model: "gpt-5-mini-2025-08-07" | "gpt-5-mini";
  status: "no_findings" | "findings";
  fitRecommendation: "good" | "review" | "caution";
  summary: string;
  findings: RepresentativityFinding[];
};

type ValidatedRequest = {
  experimentId: string;
  experimentName: string;
  referenceColumns: ColumnEvidence[];
  contextColumns: ContextEvidence[];
};

type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; message: string };

const MAX_COLUMNS = 12;
const MAX_SNIPPETS_PER_COLUMN = 8;
const MAX_VALUES_PER_COLUMN = 8;
const MAX_SNIPPET_LENGTH = 320;
const MAX_VALUE_LENGTH = 160;
const MAX_FINDINGS = 10;
const MAX_NOTE_LENGTH = 400;
const MAX_SUMMARY_LENGTH = 600;

const ontology = [
  {
    id: "material_mismatch",
    label: "Material-/Edukt-Mismatch",
    hints: "Kommentar nennt andere Stoffe, Mischungen oder Chargen als die Referenzspalte."
  },
  {
    id: "temperature_mismatch",
    label: "Temperaturabweichung",
    hints: "Kommentar nennt eine Temperatur, die nicht zur Temperaturspalte passt."
  },
  {
    id: "concentration_mismatch",
    label: "Konzentrations- oder Mengenabweichung",
    hints: "Kommentar nennt andere Konzentrationen, Volumina oder Mengen."
  },
  {
    id: "batch_or_charge_note",
    label: "Charge/Sondermaterial",
    hints: "Spezielle Charge, Mischung oder Sondermaterial wird erwähnt."
  },
  {
    id: "procedure_variant",
    label: "Ablaufvariante",
    hints: "Kommentar weist auf eine Variante im Ablauf oder Setup hin."
  },
  {
    id: "other_inconsistency",
    label: "Sonstige Inkonsistenz",
    hints: "Andere Inkonsistenzen zwischen Referenz- und Kontextspalten."
  }
] as const;

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

const normalizeString = (value: unknown): string => {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return value.toString();
  return "";
};

const sanitizeArray = (
  value: unknown,
  maxItems: number,
  maxLength: number
): ValidationResult<string[]> => {
  if (!Array.isArray(value)) {
    return { ok: false, message: "Invalid values" };
  }
  const sanitized: string[] = [];
  for (const entry of value) {
    const text = normalizeString(entry);
    if (!text) continue;
    sanitized.push(text.slice(0, maxLength));
    if (sanitized.length >= maxItems) break;
  }
  return { ok: true, value: sanitized };
};

const sanitizeColumns = (
  value: unknown,
  maxColumns: number,
  maxItems: number,
  maxLength: number,
  label: "reference" | "context"
): ValidationResult<ColumnEvidence[] | ContextEvidence[]> => {
  if (!Array.isArray(value) || value.length === 0 || value.length > maxColumns) {
    return { ok: false, message: `Invalid ${label} column selection` };
  }

  const sanitized: (ColumnEvidence | ContextEvidence)[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") {
      return { ok: false, message: `Invalid ${label} column selection` };
    }
    const column = normalizeString((entry as any).column);
    if (!column) {
      return { ok: false, message: `Invalid ${label} column selection` };
    }
    const valuesField = label === "reference" ? "values" : "snippets";
    const sanitizedValues = sanitizeArray((entry as any)[valuesField], maxItems, maxLength);
    if (!sanitizedValues.ok) {
      return { ok: false, message: `Invalid ${label} column selection` };
    }
    if (label === "reference") {
      sanitized.push({ column, values: sanitizedValues.value });
    } else {
      sanitized.push({ column, snippets: sanitizedValues.value });
    }
  }

  return { ok: true, value: sanitized };
};

const validateRequest = (body: unknown): ValidationResult<ValidatedRequest> => {
  if (!body || typeof body !== "object") {
    return { ok: false, message: "Invalid request" };
  }

  const experimentId = normalizeString((body as any).experimentId);
  const experimentName = normalizeString((body as any).experimentName);
  if (!experimentId) {
    return { ok: false, message: "Invalid request" };
  }

  const referenceColumns = sanitizeColumns(
    (body as any).referenceColumns,
    MAX_COLUMNS,
    MAX_VALUES_PER_COLUMN,
    MAX_VALUE_LENGTH,
    "reference"
  );
  if (!referenceColumns.ok) {
    return { ok: false, message: referenceColumns.message };
  }

  const contextColumns = sanitizeColumns(
    (body as any).contextColumns,
    MAX_COLUMNS,
    MAX_SNIPPETS_PER_COLUMN,
    MAX_SNIPPET_LENGTH,
    "context"
  );
  if (!contextColumns.ok) {
    return { ok: false, message: contextColumns.message };
  }

  return {
    ok: true,
    value: {
      experimentId,
      experimentName: experimentName || experimentId,
      referenceColumns: referenceColumns.value as ColumnEvidence[],
      contextColumns: contextColumns.value as ContextEvidence[]
    }
  };
};

const validateModelResult = (
  payload: unknown
): ValidationResult<RepresentativityScanModelResult> => {
  if (!payload || typeof payload !== "object") {
    return { ok: false, message: "Invalid model output" };
  }

  const experimentId = normalizeString((payload as any).experimentId);
  const experimentName = normalizeString((payload as any).experimentName);
  const model = normalizeString((payload as any).model);
  const status = normalizeString((payload as any).status);
  const fitRecommendation = normalizeString((payload as any).fitRecommendation);
  const summary = normalizeString((payload as any).summary);
  const findings = (payload as any).findings;

  if (!experimentId || !experimentName) {
    return { ok: false, message: "Invalid model output" };
  }
  if (!["gpt-5-mini-2025-08-07", "gpt-5-mini"].includes(model)) {
    return { ok: false, message: "Invalid model output" };
  }
  if (!["no_findings", "findings"].includes(status)) {
    return { ok: false, message: "Invalid model output" };
  }
  if (!["good", "review", "caution"].includes(fitRecommendation)) {
    return { ok: false, message: "Invalid model output" };
  }
  if (!summary || summary.length > MAX_SUMMARY_LENGTH) {
    return { ok: false, message: "Invalid model output" };
  }
  if (!Array.isArray(findings)) {
    return { ok: false, message: "Invalid model output" };
  }

  const sanitizedFindings: RepresentativityFinding[] = [];
  for (const entry of findings.slice(0, MAX_FINDINGS)) {
    if (!entry || typeof entry !== "object") {
      return { ok: false, message: "Invalid model output" };
    }
    const category = normalizeString((entry as any).category);
    const snippet = normalizeString((entry as any).snippet);
    const sourceColumn = normalizeString((entry as any).sourceColumn);
    const note = (entry as any).note;

    if (!category || !sourceColumn || !snippet) {
      return { ok: false, message: "Invalid model output" };
    }
    if (!ontology.some((item) => item.id === category)) {
      return { ok: false, message: "Invalid model output" };
    }
    const normalizedNote = note === undefined ? undefined : normalizeString(note);
    if (normalizedNote && normalizedNote.length > MAX_NOTE_LENGTH) {
      return { ok: false, message: "Invalid model output" };
    }

    sanitizedFindings.push({
      category: category as RepresentativityFinding["category"],
      snippet: snippet.slice(0, MAX_SNIPPET_LENGTH),
      sourceColumn: sourceColumn.slice(0, 120),
      note: normalizedNote ? normalizedNote.slice(0, MAX_NOTE_LENGTH) : undefined
    });
  }

  return {
    ok: true,
    value: {
      experimentId,
      experimentName,
      model: model as RepresentativityScanModelResult["model"],
      status: status as "no_findings" | "findings",
      fitRecommendation: fitRecommendation as RepresentativityScanModelResult["fitRecommendation"],
      summary: summary.slice(0, MAX_SUMMARY_LENGTH),
      findings: sanitizedFindings
    }
  };
};

const buildPrompt = (payload: ValidatedRequest): { system: string; user: string } => {
  const ontologyText = ontology
    .map((item) => `- ${item.id}: ${item.label}. ${item.hints}`)
    .join("\n");

  const schemaText = `{
  "experimentId": string,
  "experimentName": string,
  "model": "gpt-5-mini-2025-08-07" | "gpt-5-mini",
  "status": "no_findings" | "findings",
  "fitRecommendation": "good" | "review" | "caution",
  "summary": string,
  "findings": [
    {"category": <ontology id>, "snippet": string, "sourceColumn": string, "note": string?}
  ]
}`;

  const system = [
    "Du bist ein Assistent, der Referenz- und Kontextspalten für Experimente vergleicht.",
    "Finde Inkonsistenzen zwischen Referenzspalten (z.B. Temperatur, Edukt, Charge) und Kontext/Kommentar.",
    "Nutze ausschließlich diese 6 Ontologie-Kategorien und erfinde keine weiteren:",
    ontologyText,
    "Gib keine Korrekturvorschläge, keine neuen Daten und keine Ausschlussentscheidung.",
    "Gib eine Fit-Empfehlung ab: good (geeignet), review (prüfen), caution (auffällig).",
    "Die Empfehlung dient nur als Hinweis; Experimente dürfen nicht automatisch ausgeschlossen werden.",
    "Beziehe dich immer auf konkrete Textstellen oder Werte aus den gelieferten Spalten.",
    "Antwortformat NUR als JSON ohne Markdown, gemäß Schema:",
    schemaText
  ].join("\n");

  const user = JSON.stringify({
    experimentId: payload.experimentId,
    experimentName: payload.experimentName,
    referenceColumns: payload.referenceColumns,
    contextColumns: payload.contextColumns
  });

  return { system, user };
};

const logError = (requestId: string, error: unknown, fallbackMessage: string) => {
  const payload =
    error instanceof Error
      ? { message: error.message, stack: error.stack }
      : { message: fallbackMessage, stack: undefined };
  console.error("[representativity-scan] failure", { requestId, ...payload });
};

const hasOpenAIKey = (): boolean =>
  typeof process.env.OPENAI_API_KEY === "string" && process.env.OPENAI_API_KEY.trim() !== "";

export default async function handler(req: any, res: any) {
  const requestId = createRequestId();
  const primaryModel = "gpt-5-mini-2025-08-07";
  const fallbackModel = "gpt-5-mini";

  try {
    if (req.method !== "POST") {
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
    const timeout = setTimeout(() => controller.abort(), 30_000);

    let rawModelOutput = "";
    let usedModel = primaryModel;
    const buildRequest = (model: string) =>
      ({
        model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user }
        ],
        max_completion_tokens: 1000,
        response_format: { type: "json_object" }
      }) as const;

    const tryCompletion = async (model: string) => {
      const completion = await openai.chat.completions.create(buildRequest(model), {
        signal: controller.signal
      });
      return completion.choices?.[0]?.message?.content ?? "";
    };

    try {
      rawModelOutput = await tryCompletion(primaryModel);
    } catch (primaryError: any) {
      const status = typeof primaryError?.status === "number" ? primaryError.status : undefined;
      const message = primaryError instanceof Error ? primaryError.message : "OpenAI call failed";
      console.error("[representativity-scan] primary openai failure", {
        requestId,
        status,
        message,
        stack: primaryError?.stack,
        model: primaryModel
      });
      try {
        usedModel = fallbackModel;
        rawModelOutput = await tryCompletion(fallbackModel);
      } catch (fallbackError: any) {
        clearTimeout(timeout);
        const fallbackStatus =
          typeof fallbackError?.status === "number" ? fallbackError.status : undefined;
        const fallbackMessage =
          fallbackError instanceof Error ? fallbackError.message : "OpenAI call failed";
        console.error("[representativity-scan] fallback openai failure", {
          requestId,
          status: fallbackStatus,
          message: fallbackMessage,
          stack: fallbackError?.stack,
          model: fallbackModel
        });
        logError(requestId, fallbackError, "OpenAI call failed");
        return sendJson(res, 502, {
          ok: false,
          error: "OpenAI call failed",
          requestId,
          details: fallbackStatus ? `${fallbackStatus} ${fallbackMessage}` : fallbackMessage,
          debug: {
            modelInput: { system, user },
            modelOutput: rawModelOutput.slice(0, 2000),
            status: fallbackStatus,
            message: fallbackMessage,
            stack: fallbackError?.stack,
            triedModels: [primaryModel, fallbackModel]
          }
        });
      }
    } finally {
      clearTimeout(timeout);
    }

    let parsedModel: unknown;
    try {
      parsedModel = rawModelOutput ? JSON.parse(rawModelOutput) : null;
    } catch (error) {
      console.error("[representativity-scan] model parse failure", {
        requestId,
        preview: rawModelOutput.slice(0, 500)
      });
      logError(requestId, error, "Invalid model output");
      return sendJson(res, 502, {
        ok: false,
        error: "Invalid model output",
        requestId,
        details: "JSON parse failed",
        modelOutputPreview: rawModelOutput.slice(0, 500),
        debug: {
          modelInput: { system, user },
          modelOutput: rawModelOutput.slice(0, 2000)
        }
      });
    }

    const validatedModel = validateModelResult(parsedModel);
    if (!validatedModel.ok) {
      console.error("[representativity-scan] model validation failure", {
        requestId,
        preview: rawModelOutput.slice(0, 500)
      });
      return sendJson(res, 502, {
        ok: false,
        error: "Invalid model output",
        requestId,
        details: "Validation failed",
        modelOutputPreview: rawModelOutput.slice(0, 500),
        debug: {
          modelInput: { system, user },
          modelOutput: rawModelOutput.slice(0, 2000)
        }
      });
    }

    return sendJson(res, 200, {
      ok: true,
      requestId,
      result: {
        ...validatedModel.value,
        model: usedModel as RepresentativityScanModelResult["model"]
      },
      debug: {
        modelInput: { system, user },
        modelOutput: rawModelOutput.slice(0, 2000)
      }
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
