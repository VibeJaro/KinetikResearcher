import { randomUUID } from "crypto";
import OpenAI from "openai";

export const config = {
  runtime: "nodejs"
};

type ReferenceEvidence = {
  column: string;
  values: string[];
};

type DetailEvidence = {
  column: string;
  snippets: string[];
};

type ConsistencyScanRequest = {
  experimentId: string;
  experimentName?: string;
  referenceColumns: ReferenceEvidence[];
  detailColumns: DetailEvidence[];
};

type ConsistencyFinding = {
  category:
    | "apparatus_issue"
    | "dosing_mode_change"
    | "temp_pressure_instability"
    | "procedure_change"
    | "material_quality"
    | "unexpected_event"
    | "explicit_warning"
    | "workup_change"
    | "analytics_issue"
    | "explicit_parameter_in_comment"
    | "parameter_mismatch"
    | "material_identity_mismatch"
    | "condition_mismatch";
  snippet: string;
  sourceColumn: string;
  note?: string;
};

type ConsistencyScanModelResult = {
  experimentId: string;
  experimentName?: string;
  model: "gpt-5-mini-2025-08-07" | "gpt-5-mini";
  status: "no_findings" | "findings";
  findings: ConsistencyFinding[];
};

type ValidatedRequest = {
  experimentId: string;
  experimentName: string;
  referenceColumns: ReferenceEvidence[];
  detailColumns: DetailEvidence[];
};

type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; message: string };

const MAX_COLUMNS = 12;
const MAX_SNIPPETS_PER_COLUMN = 8;
const MAX_VALUES_PER_COLUMN = 8;
const MAX_SNIPPET_LENGTH = 320;
const MAX_VALUE_LENGTH = 160;
const MAX_FINDINGS = 12;
const MAX_NOTE_LENGTH = 200;

const ontology = [
  {
    id: "apparatus_issue",
    label: "Apparatur- oder Anlagenprobleme",
    hints:
      "Leckagen, Druckverlust, defekte Bauteile, undichte Schläuche, Ventile, Rührer, Pumpen, Sensoren oder ähnliche technische Probleme."
  },
  {
    id: "dosing_mode_change",
    label: "Abweichender Dosier- oder Zugabemodus",
    hints:
      "Edukte oder Reagenzien werden portionsweise, langsam, verteilt über Zeit oder per Pumpe zugegeben."
  },
  {
    id: "temp_pressure_instability",
    label: "Temperatur- oder Druckinstabilität",
    hints: "Schwankungen, Abweichungen oder Schwierigkeiten beim Halten von Temperatur oder Druck."
  },
  {
    id: "procedure_change",
    label: "Geänderte Reihenfolge oder veränderter Ablauf",
    hints: "Schritte in anderer Reihenfolge oder Ablauf bewusst angepasst."
  },
  {
    id: "material_quality",
    label: "Probleme mit Materialqualität oder Verunreinigungen",
    hints: "Feuchtigkeit, Wasser, Verunreinigungen, falsche Qualität, alte Chemikalien oder Nebenstoffe."
  },
  {
    id: "unexpected_event",
    label: "Unerwartete Ereignisse oder Zwischenfälle",
    hints:
      "Abbruch, Notabschaltung, Sicherheitsereignisse, unkontrollierte Reaktionen, Gasentwicklung, Verfärbungen oder ähnliche Vorfälle."
  },
  {
    id: "explicit_warning",
    label: "Explizite Warnungen oder Einschränkungen",
    hints: "Autor:innen bitten um Vorsicht, warnen vor Vergleichbarkeit oder markieren Ergebnisse als eingeschränkt."
  },
  {
    id: "workup_change",
    label: "Geänderter Aufarbeitungs- oder Isolationsschritt",
    hints: "Änderungen bei Quench, Extraktion, Filtration, Destillation, Trocknung oder ähnlichen Nacharbeitsschritten."
  },
  {
    id: "analytics_issue",
    label: "Probleme bei Analytik oder Probenahme",
    hints: "Fehlerhafte Messungen, unklare Analysedaten, Probleme bei GC, HPLC, NMR oder Probenverlust."
  },
  {
    id: "explicit_parameter_in_comment",
    label: "Explizite Angabe zentraler Versuchsparameter im Kommentar",
    hints: "Kommentare nennen Stoffidentitäten, Mengen, Konzentrationen oder Bedingungen, die als wichtig hervorgehoben werden."
  },
  {
    id: "parameter_mismatch",
    label: "Widersprüchliche Parameterangabe",
    hints: "Kommentar oder Zusatzspalte nennt Parameterwerte, die nicht mit Tabellenparametern übereinstimmen."
  },
  {
    id: "material_identity_mismatch",
    label: "Abweichende Stoffidentität oder Charge",
    hints: "Kommentar nennt anderes Edukt, Mischung oder spezielle Charge, die nicht zur Spalte passt."
  },
  {
    id: "condition_mismatch",
    label: "Abweichende Reaktionsbedingungen",
    hints: "Hinweise auf andere Bedingungen (z.B. Temperatur, Druck, Lösemittel), die nicht mit den Spalten übereinstimmen."
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

const sanitizeSnippetArray = (
  value: unknown,
  maxItems: number,
  maxLength: number
): ValidationResult<string[]> => {
  if (!Array.isArray(value)) {
    return { ok: false, message: "Invalid entries" };
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

const sanitizeReferenceColumns = (
  value: unknown,
  maxItems: number,
  maxLength: number
): ValidationResult<ReferenceEvidence[]> => {
  if (!Array.isArray(value) || value.length === 0 || value.length > maxItems) {
    return { ok: false, message: "Invalid reference columns" };
  }

  const sanitized: ReferenceEvidence[] = [];
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null) {
      return { ok: false, message: "Invalid reference columns" };
    }
    const column = normalizeString((entry as any).column);
    const valuesRaw = sanitizeSnippetArray(
      (entry as any).values,
      MAX_VALUES_PER_COLUMN,
      maxLength
    );
    if (!column || !valuesRaw.ok) {
      return { ok: false, message: "Invalid reference columns" };
    }
    sanitized.push({ column, values: valuesRaw.value });
  }
  return { ok: true, value: sanitized };
};

const sanitizeDetailColumns = (
  value: unknown,
  maxItems: number,
  maxLength: number
): ValidationResult<DetailEvidence[]> => {
  if (!Array.isArray(value) || value.length === 0 || value.length > maxItems) {
    return { ok: false, message: "Invalid detail columns" };
  }

  const sanitized: DetailEvidence[] = [];
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null) {
      return { ok: false, message: "Invalid detail columns" };
    }
    const column = normalizeString((entry as any).column);
    const snippetsRaw = sanitizeSnippetArray(
      (entry as any).snippets,
      MAX_SNIPPETS_PER_COLUMN,
      maxLength
    );
    if (!column || !snippetsRaw.ok) {
      return { ok: false, message: "Invalid detail columns" };
    }
    sanitized.push({ column, snippets: snippetsRaw.value });
  }
  return { ok: true, value: sanitized };
};

const validateRequest = (body: unknown): ValidationResult<ValidatedRequest> => {
  if (typeof body !== "object" || body === null) {
    return { ok: false, message: "Invalid request" };
  }
  const experimentId = normalizeString((body as any).experimentId);
  if (!experimentId) {
    return { ok: false, message: "Invalid request" };
  }
  const experimentName = normalizeString((body as any).experimentName) || experimentId;
  const referenceColumns = sanitizeReferenceColumns(
    (body as any).referenceColumns,
    MAX_COLUMNS,
    MAX_VALUE_LENGTH
  );
  if (!referenceColumns.ok) {
    return referenceColumns;
  }
  const detailColumns = sanitizeDetailColumns(
    (body as any).detailColumns,
    MAX_COLUMNS,
    MAX_SNIPPET_LENGTH
  );
  if (!detailColumns.ok) {
    return detailColumns;
  }

  return {
    ok: true,
    value: {
      experimentId,
      experimentName,
      referenceColumns: referenceColumns.value,
      detailColumns: detailColumns.value
    }
  };
};

const validateModelResult = (data: unknown): ValidationResult<ConsistencyScanModelResult> => {
  if (typeof data !== "object" || data === null) {
    return { ok: false, message: "Invalid model output" };
  }
  const { experimentId, experimentName, model, status, findings, ...rest } = data as any;

  if (Object.keys(rest ?? {}).length > 0) {
    return { ok: false, message: "Invalid model output" };
  }
  if (normalizeString(experimentId) === "") {
    return { ok: false, message: "Invalid model output" };
  }
  if (!["gpt-5-mini-2025-08-07", "gpt-5-mini"].includes(model)) {
    return { ok: false, message: "Invalid model output" };
  }
  if (!["no_findings", "findings"].includes(status)) {
    return { ok: false, message: "Invalid model output" };
  }
  if (!Array.isArray(findings) || findings.length > MAX_FINDINGS) {
    return { ok: false, message: "Invalid model output" };
  }

  const allowedCategories = ontology.map((item) => item.id);
  const sanitizedFindings: ConsistencyFinding[] = [];
  for (const entry of findings) {
    if (typeof entry !== "object" || entry === null) {
      return { ok: false, message: "Invalid model output" };
    }
    const { category, snippet, sourceColumn, note, ...restFinding } = entry as any;
    if (Object.keys(restFinding ?? {}).length > 0) {
      return { ok: false, message: "Invalid model output" };
    }
    if (!allowedCategories.includes(category)) {
      return { ok: false, message: "Invalid model output" };
    }
    const normalizedSnippet = normalizeString(snippet);
    const normalizedSource = normalizeString(sourceColumn);
    if (!normalizedSnippet || !normalizedSource) {
      return { ok: false, message: "Invalid model output" };
    }
    const normalizedNote = note === undefined ? undefined : normalizeString(note);
    if (normalizedNote && normalizedNote.length > MAX_NOTE_LENGTH) {
      return { ok: false, message: "Invalid model output" };
    }
    sanitizedFindings.push({
      category,
      snippet: normalizedSnippet.slice(0, MAX_SNIPPET_LENGTH),
      sourceColumn: normalizedSource.slice(0, 120),
      note: normalizedNote ? normalizedNote.slice(0, MAX_NOTE_LENGTH) : undefined
    });
  }

  return {
    ok: true,
    value: {
      experimentId: normalizeString(experimentId),
      experimentName: normalizeString(experimentName),
      model: model as "gpt-5-mini-2025-08-07" | "gpt-5-mini",
      status: status as "no_findings" | "findings",
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
  "findings": [
    {"category": <ontology id>, "snippet": string, "sourceColumn": string, "note": string?}
  ]
}`;

  const system = [
    "Du bist ein Assistent, der Inkonsistenzen zwischen Tabellenparametern und Kommentar-/Hinweisspalten erkennt.",
    "Ziel: Abweichungen finden, wenn Zusatzspalten Hinweise auf andere Stoffe, Bedingungen oder Chargen geben.",
    "Nutze ausschließlich diese Ontologie-Kategorien und erfinde keine weiteren:",
    ontologyText,
    "Bewerte nicht, korrigiere nicht und gib keine Empfehlungen.",
    "Zitiere die konkrete Textstelle aus den Detailspalten oder die betroffene Referenzspalte.",
    "Bevorzugtes Modell: gpt-5-mini-2025-08-07. Fallback: gpt-5-mini. Die Analyse muss von einem OpenAI-LLM stammen.",
    "Antwortformat NUR als JSON ohne Markdown, gemäß Schema:",
    schemaText
  ].join("\n");

  const user = JSON.stringify({
    experimentId: payload.experimentId,
    experimentName: payload.experimentName,
    referenceColumns: payload.referenceColumns,
    detailColumns: payload.detailColumns
  });

  return { system, user };
};

const logError = (requestId: string, error: unknown, fallbackMessage: string) => {
  const payload =
    error instanceof Error
      ? { message: error.message, stack: error.stack }
      : { message: fallbackMessage, stack: undefined };
  console.error("[deviation-consistency] failure", { requestId, ...payload });
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
      console.error("[deviation-consistency] primary openai failure", {
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
        console.error("[deviation-consistency] fallback openai failure", {
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
      console.error("[deviation-consistency] model parse failure", {
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
      console.error("[deviation-consistency] model validation failure", {
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
      result: { ...validatedModel.value, model: usedModel as ConsistencyScanModelResult["model"] },
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
