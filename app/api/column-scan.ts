import { randomUUID } from "crypto";
import OpenAI from "openai";
import { z } from "zod";

export const config = {
  runtime: "nodejs"
};

type ColumnRole = "condition" | "comment" | "noise";

const columnSchema = z
  .object({
    name: z.string().min(1).transform((value) => value.trim()),
    typeHeuristic: z.enum(["numeric", "text", "mixed"]),
    nonNullRatio: z.number().min(0).max(1),
    examples: z
      .array(z.string().transform((value) => value.slice(0, 120)))
      .max(10)
      .optional()
  })
  .strict();

const requestSchema = z
  .object({
    columns: z.array(columnSchema).min(1).max(500),
    experimentCount: z.number().finite().optional(),
    knownStructuralColumns: z.array(z.string().min(1)).optional().default([]),
    includeComments: z.boolean().optional().default(false)
  })
  .strict();

const modelOutputSchema = z
  .object({
    selectedColumns: z.array(z.string().min(1)).max(8),
    columnRoles: z.record(z.enum(["condition", "comment", "noise"])),
    factorCandidates: z.array(z.string().min(1)).max(12),
    notes: z.string().max(400),
    uncertainties: z.array(z.string().min(1).max(160)).max(8)
  })
  .strict();

type ValidRequest = z.infer<typeof requestSchema>;
type ModelOutput = z.infer<typeof modelOutputSchema>;

const jsonResponse = (res: any, statusCode: number, payload: Record<string, unknown>) => {
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

const createRequestId = (): string => {
  try {
    return randomUUID();
  } catch {
    return `req-${Math.random().toString(36).slice(2, 10)}`;
  }
};

const readRequestBody = async (req: any): Promise<unknown> => {
  if (req.body !== undefined && req.body !== null) {
    if (typeof req.body === "string") {
      return JSON.parse(req.body);
    }
    if (Buffer.isBuffer(req.body)) {
      return JSON.parse(req.body.toString("utf8"));
    }
    if (typeof req.body === "object") {
      return req.body;
    }
  }

  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  if (chunks.length === 0) {
    return null;
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  return JSON.parse(raw);
};

const logStart = (payload: {
  requestId: string;
  method: string | undefined;
  colCount: number | null;
  experimentCount: number | null;
  includeComments: boolean;
}) => {
  console.info("[column-scan] start", payload);
};

const logSuccess = (requestId: string, selectedCount: number) => {
  console.info("[column-scan] success", { requestId, selectedColumns: selectedCount });
};

const logFailure = (requestId: string, error: unknown, fallbackMessage: string) => {
  const payload =
    error instanceof Error
      ? { message: error.message, stack: error.stack }
      : { message: fallbackMessage, stack: undefined };
  console.error("[column-scan] fail", { requestId, ...payload });
};

const ensureOpenAIClient = (apiKey: string | undefined) => {
  if (!apiKey || apiKey.trim() === "") {
    return null;
  }
  return new OpenAI({ apiKey });
};

const toJsonSchema = {
  name: "column_scan_result",
  schema: {
    type: "object",
    properties: {
      selectedColumns: {
        type: "array",
        items: { type: "string", minLength: 1 },
        maxItems: 8
      },
      columnRoles: {
        type: "object",
        additionalProperties: {
          type: "string",
          enum: ["condition", "comment", "noise"]
        }
      },
      factorCandidates: {
        type: "array",
        items: { type: "string", minLength: 1 },
        maxItems: 12
      },
      notes: { type: "string", maxLength: 400 },
      uncertainties: {
        type: "array",
        items: { type: "string", minLength: 1, maxLength: 160 },
        maxItems: 8
      }
    },
    required: ["selectedColumns", "columnRoles", "factorCandidates", "notes", "uncertainties"],
    additionalProperties: false
  },
  strict: true
} as const;

const uniqueList = (values: string[]): string[] => {
  const seen = new Set<string>();
  const result: string[] = [];
  values.forEach((value) => {
    const trimmed = value.trim();
    if (trimmed && !seen.has(trimmed)) {
      seen.add(trimmed);
      result.push(trimmed);
    }
  });
  return result;
};

const validateModelOutput = (
  output: unknown,
  requestColumns: string[]
): { ok: true; data: ModelOutput } | { ok: false; message: string } => {
  const parsed = modelOutputSchema.safeParse(output);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.message };
  }

  const selected = uniqueList(parsed.data.selectedColumns).slice(0, 8);
  if (selected.some((column) => !requestColumns.includes(column))) {
    return { ok: false, message: "Selected columns must come from the provided columns list." };
  }

  const roleNames = Object.keys(parsed.data.columnRoles);
  if (roleNames.some((name) => !requestColumns.includes(name))) {
    return { ok: false, message: "Column roles must only reference provided columns." };
  }

  return {
    ok: true,
    data: {
      ...parsed.data,
      selectedColumns: selected,
      factorCandidates: uniqueList(parsed.data.factorCandidates).slice(0, 12),
      uncertainties: parsed.data.uncertainties.slice(0, 8)
    }
  };
};

const buildPrompt = (body: ValidRequest): string => {
  const conditionPreference =
    "Focus on experimental condition columns (catalyst, additive, solvent, temp, batch, etc.). Avoid structural columns unless necessary.";
  const commentsRule = body.includeComments
    ? "Include comment-like columns when they add context, but label them with role \"comment\"."
    : "Avoid selecting comment-like columns unless essential; if included, mark their role as \"comment\".";
  const knownStructural =
    body.knownStructuralColumns.length > 0
      ? `Known structural columns to avoid: ${body.knownStructuralColumns.join(", ")}.`
      : "No explicit structural columns provided.";

  return [
    "You are selecting up to 8 columns to keep for kinetic experiment grouping.",
    conditionPreference,
    commentsRule,
    knownStructural,
    "Use the provided column summaries (type heuristic, non-null ratio, short examples).",
    "Return ONLY the JSON defined by the schema. Do not invent keys or markdown."
  ].join("\n");
};

const requestColumnsFromBody = (body: ValidRequest): string[] =>
  body.columns.map((column) => column.name);

const callOpenAI = async (client: OpenAI, body: ValidRequest, signal: AbortSignal) => {
  const completion = await client.chat.completions.create(
    {
      model: "gpt-5.2",
      temperature: 0,
      max_tokens: 600,
      response_format: { type: "json_schema", json_schema: toJsonSchema },
      messages: [
        {
          role: "system",
          content: buildPrompt(body)
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  experimentCount: body.experimentCount ?? null,
                  includeComments: body.includeComments,
                  knownStructuralColumns: body.knownStructuralColumns,
                  columns: body.columns
                },
                null,
                2
              )
            }
          ]
        }
      ]
    },
    { signal }
  );

  const content = completion.choices[0]?.message?.content;
  if (!content || typeof content !== "string") {
    throw new Error("Empty model output");
  }
  return content;
};

export default async function handler(req: any, res: any) {
  const requestId = createRequestId();

  if (req.method !== "POST") {
    logStart({
      requestId,
      method: req.method,
      colCount: null,
      experimentCount: null,
      includeComments: false
    });
    return jsonResponse(res, 405, {
      ok: false,
      error: "Method Not Allowed",
      requestId
    });
  }

  let parsedBody: unknown;
  try {
    parsedBody = await readRequestBody(req);
  } catch (error) {
    logFailure(requestId, error, "Invalid JSON");
    logStart({
      requestId,
      method: req.method,
      colCount: null,
      experimentCount: null,
      includeComments: false
    });
    return jsonResponse(res, 400, { ok: false, error: "Invalid request", requestId });
  }

  const validated = requestSchema.safeParse(parsedBody);
  const colCount = Array.isArray((parsedBody as any)?.columns)
    ? (parsedBody as any).columns.length
    : null;
  const includeComments = validated.success ? validated.data.includeComments : false;
  logStart({
    requestId,
    method: req.method,
    colCount,
    experimentCount: validated.success && validated.data.experimentCount !== undefined
      ? validated.data.experimentCount
      : null,
    includeComments
  });

  if (!validated.success) {
    logFailure(requestId, validated.error, "Invalid request");
    return jsonResponse(res, 400, { ok: false, error: "Invalid request", requestId });
  }

  const client = ensureOpenAIClient(process.env.OPENAI_API_KEY);
  if (!client) {
    logFailure(requestId, null, "Missing OPENAI_API_KEY");
    return jsonResponse(res, 500, {
      ok: false,
      error: "Missing OPENAI_API_KEY",
      requestId
    });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25_000);

  try {
    const rawModelOutput = await callOpenAI(client, validated.data, controller.signal);
    let parsedModelOutput: unknown;
    try {
      parsedModelOutput = JSON.parse(rawModelOutput);
    } catch {
      logFailure(requestId, null, "Model response was not valid JSON");
      console.error("[column-scan] raw-output", rawModelOutput.slice(0, 500));
      return jsonResponse(res, 502, {
        ok: false,
        error: "Invalid model output",
        requestId,
        details: "JSON parse failed"
      });
    }

    const validationResult = validateModelOutput(
      parsedModelOutput,
      requestColumnsFromBody(validated.data)
    );
    if (!validationResult.ok) {
      logFailure(requestId, null, validationResult.message);
      console.error(
        "[column-scan] raw-output",
        typeof rawModelOutput === "string" ? rawModelOutput.slice(0, 500) : ""
      );
      return jsonResponse(res, 502, {
        ok: false,
        error: "Invalid model output",
        requestId,
        details: validationResult.message
      });
    }

    logSuccess(requestId, validationResult.data.selectedColumns.length);
    return jsonResponse(res, 200, {
      ok: true,
      requestId,
      result: validationResult.data
    });
  } catch (error) {
    const message =
      error instanceof Error && error.name === "AbortError"
        ? "Model call timed out"
        : "OpenAI call failed";
    logFailure(requestId, error, message);
    return jsonResponse(res, 502, {
      ok: false,
      error: message,
      requestId
    });
  } finally {
    clearTimeout(timeout);
  }
}
