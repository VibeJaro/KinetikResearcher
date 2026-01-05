import { randomUUID } from "crypto";
import OpenAI from "openai";

export const config = {
  runtime: "nodejs"
};

type ColumnEvidence = {
  column: string;
  snippets: string[];
};

type ParameterEvidence = {
  column: string;
  values: string[];
};

type DeviationScanRequest = {
  experimentId: string;
  experimentName?: string;
  deviationColumns: ColumnEvidence[];
  parameterColumns?: ParameterEvidence[];
};

type DeviationFinding = {
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
    | "explicit_parameter_in_comment";
  snippet: string;
  sourceColumn: string;
  note?: string;
};

type DeviationScanModelResult = {
  experimentId: string;
  experimentName?: string;
  model: "gpt-5.2-mini";
  status: "no_findings" | "findings";
  findings: DeviationFinding[];
};

type ValidatedRequest = {
  experimentId: string;
  experimentName: string;
  deviationColumns: ColumnEvidence[];
  parameterColumns: ParameterEvidence[];
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
    return { ok: false, message: "Invalid snippets" };
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
  maxItems: number,
  maxLength: number
): ValidationResult<ColumnEvidence[]> => {
  if (!Array.isArray(value) || value.length === 0 || value.length > maxItems) {
    return { ok: false, message: "Invalid column selection" };
  }

  const sanitized: ColumnEvidence[] = [];
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null) {
      return { ok: false, message: "Invalid column selection" };
    }
    const column = normalizeString((entry as any).column);
    const snippetsRaw = sanitizeSnippetArray(
      (entry as any).snippets,
      MAX_SNIPPETS_PER_COLUMN,
      maxLength
    );
    if (!column || !snippetsRaw.ok) {
      return { ok: false, message: "Invalid column selection" };
    }
    sanitized.push({ column, snippets: snippetsRaw.value });
  }
  return { ok: true, value: sanitized };
};

const sanitizeParameterColumns = (
  value: unknown,
  maxItems: number,
  maxLength: number
): ValidationResult<ParameterEvidence[]> => {
  if (value === undefined) {
    return { ok: true, value: [] };
  }
  if (!Array.isArray(value) || value.length > maxItems) {
    return { ok: false, message: "Invalid parameter columns" };
  }
  const sanitized: ParameterEvidence[] = [];
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null) {
      return { ok: false, message: "Invalid parameter columns" };
    }
    const column = normalizeString((entry as any).column);
    const values = sanitizeSnippetArray(
      (entry as any).values,
      MAX_VALUES_PER_COLUMN,
      maxLength
    );
    if (!column || !values.ok) {
      return { ok: false, message: "Invalid parameter columns" };
    }
    sanitized.push({ column, values: values.value });
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
  const deviationColumns = sanitizeColumns((body as any).deviationColumns, MAX_COLUMNS, MAX_SNIPPET_LENGTH);
  if (!deviationColumns.ok) {
    return deviationColumns;
  }
  const parameterColumns = sanitizeParameterColumns(
    (body as any).parameterColumns,
    MAX_COLUMNS,
    MAX_VALUE_LENGTH
  );
  if (!parameterColumns.ok) {
    return parameterColumns;
  }

  return {
    ok: true,
    value: {
      experimentId,
      experimentName,
      deviationColumns: deviationColumns.value,
      parameterColumns: parameterColumns.value
    }
  };
};

const validateModelResult = (data: unknown): ValidationResult<DeviationScanModelResult> => {
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
  if (model !== "gpt-5.2-mini") {
    return { ok: false, message: "Invalid model output" };
  }
  if (!["no_findings", "findings"].includes(status)) {
    return { ok: false, message: "Invalid model output" };
  }
  if (!Array.isArray(findings) || findings.length > MAX_FINDINGS) {
    return { ok: false, message: "Invalid model output" };
  }

  const allowedCategories = ontology.map((item) => item.id);
  const sanitizedFindings: DeviationFinding[] = [];
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
      model: "gpt-5.2-mini",
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
  "model": "gpt-5.2-mini",
  "status": "no_findings" | "findings",
  "findings": [
    {"category": <ontology id>, "snippet": string, "sourceColumn": string, "note": string?}
  ]
}`;

  const system = [
    "Du bist ein Assistent, der Kommentare chemischer Experimente liest und nur Abweichungen klassifiziert.",
    "Nutze ausschließlich diese 10 Ontologie-Kategorien und erfinde keine weiteren:",
    ontologyText,
    "Gib keine Bewertungen, keine Korrekturvorschläge und kein Urteil zur Datenqualität.",
    "Identifiziere nur Textstellen aus den Kommentarspalten, auf denen die Entscheidung beruht.",
    "Die Analyse muss von GPT-5.2 mini stammen; es gibt keinen Fallback.",
    "Antwortformat NUR als JSON ohne Markdown, gemäß Schema:",
    schemaText
  ].join("\n");

  const user = JSON.stringify({
    experimentId: payload.experimentId,
    experimentName: payload.experimentName,
    deviationColumns: payload.deviationColumns,
    parameterColumns: payload.parameterColumns
  });

  return { system, user };
};

const logError = (requestId: string, error: unknown, fallbackMessage: string) => {
  const payload =
    error instanceof Error
      ? { message: error.message, stack: error.stack }
      : { message: fallbackMessage, stack: undefined };
  console.error("[deviation-scan] failure", { requestId, ...payload });
};

const hasOpenAIKey = (): boolean =>
  typeof process.env.OPENAI_API_KEY === "string" && process.env.OPENAI_API_KEY.trim() !== "";

export default async function handler(req: any, res: any) {
  const requestId = createRequestId();

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
    const openAiRequest = {
      model: "gpt-5.2-mini",
      messages: [
        { role: "system", content: system },
        { role: "user", content: user }
      ],
      temperature: 0,
      max_completion_tokens: 700,
      response_format: { type: "json_object" }
    } as const;

    try {
      const completion = await openai.chat.completions.create(openAiRequest, {
        signal: controller.signal
      });
      rawModelOutput = completion.choices?.[0]?.message?.content ?? "";
    } catch (error: any) {
      const status = typeof error?.status === "number" ? error.status : undefined;
      const message = error instanceof Error ? error.message : "OpenAI call failed";
      console.error("[deviation-scan] openai failure", {
        requestId,
        status,
        message,
        stack: error?.stack
      });
      logError(requestId, error, "OpenAI call failed");
      return sendJson(res, 502, {
        ok: false,
        error: "OpenAI call failed",
        requestId,
        details: status ? `${status} ${message}` : message,
        debug: {
          modelInput: { system, user },
          modelOutput: rawModelOutput.slice(0, 2000),
          status,
          message,
          stack: error?.stack
        }
      });
    } finally {
      clearTimeout(timeout);
    }

    let parsedModel: unknown;
    try {
      parsedModel = rawModelOutput ? JSON.parse(rawModelOutput) : null;
    } catch (error) {
      console.error("[deviation-scan] model parse failure", {
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
      console.error("[deviation-scan] model validation failure", {
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
      result: validatedModel.value,
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
