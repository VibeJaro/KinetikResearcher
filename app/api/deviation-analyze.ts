import { randomUUID } from "crypto";
import OpenAI from "openai";
import { ONTOLOGY_CATEGORIES } from "../src/lib/deviations/categories";
import { parseDeviationResponse } from "../src/lib/deviations/parser";

export const config = {
  runtime: "nodejs"
};

type ValidatedRequest = {
  experimentId: string;
  experimentName?: string;
  commentText: string;
  model: string;
  prompt: { system: string; user: string };
};

const createRequestId = (): string => {
  try {
    return randomUUID();
  } catch {
    return `req-${Math.random().toString(36).slice(2, 10)}`;
  }
};

const hasOpenAIKey = (): boolean =>
  typeof process.env.OPENAI_API_KEY === "string" && process.env.OPENAI_API_KEY.trim() !== "";

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

const validateRequest = (body: unknown): ValidatedRequest | null => {
  if (typeof body !== "object" || body === null) {
    return null;
  }
  const experimentId =
    typeof (body as any).experimentId === "string" ? (body as any).experimentId.trim() : "";
  const experimentName =
    typeof (body as any).experimentName === "string" ? (body as any).experimentName.trim() : null;
  const model =
    typeof (body as any).model === "string" && (body as any).model.trim().length > 0
      ? (body as any).model.trim()
      : "gpt-5.2-mini";
  const commentText =
    typeof (body as any).commentText === "string" ? (body as any).commentText.trim() : "";
  const prompt =
    typeof (body as any).prompt === "object" && (body as any).prompt !== null
      ? (body as any).prompt
      : null;
  const categories = Array.isArray((body as any).categories) ? (body as any).categories : [];

  if (!experimentId || !prompt || !prompt.system || !prompt.user) {
    return null;
  }
  if (!Array.isArray(categories) || categories.length !== ONTOLOGY_CATEGORIES.length) {
    return null;
  }
  const unknown = categories.filter(
    (item) => typeof item !== "string" || !ONTOLOGY_CATEGORIES.includes(item)
  );
  if (unknown.length > 0) {
    return null;
  }
  if (!commentText || commentText.length > 4000) {
    return null;
  }

  return {
    experimentId,
    experimentName: experimentName ?? undefined,
    commentText,
    model,
    prompt: { system: String(prompt.system), user: String(prompt.user) }
  };
};

export default async function handler(req: any, res: any) {
  const requestId = createRequestId();

  if (req.method !== "POST") {
    return sendJson(res, 405, { ok: false, error: "Method not allowed", requestId });
  }

  try {
    const parsedBody = await parseBody(req);
    if (!parsedBody.ok) {
      return sendJson(res, 400, { ok: false, error: "Invalid request", requestId });
    }

    const validated = validateRequest(parsedBody.body);
    if (!validated) {
      return sendJson(res, 400, { ok: false, error: "Invalid request", requestId });
    }

    if (!hasOpenAIKey()) {
      return sendJson(res, 500, { ok: false, error: "Missing OPENAI_API_KEY", requestId });
    }

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);
    let rawModelOutput = "";

    try {
      const completion = await openai.chat.completions.create(
        {
          model: validated.model,
          messages: [
            { role: "system", content: validated.prompt.system },
            { role: "user", content: validated.prompt.user }
          ],
          temperature: 0,
          max_completion_tokens: 500,
          response_format: { type: "json_object" }
        },
        { signal: controller.signal }
      );

      rawModelOutput = completion.choices?.[0]?.message?.content ?? "";
    } finally {
      clearTimeout(timeout);
    }

    let parsedModel: unknown = null;
    try {
      parsedModel = rawModelOutput ? JSON.parse(rawModelOutput) : null;
    } catch (error) {
      return sendJson(res, 502, {
        ok: false,
        error: "Invalid model output",
        requestId,
        details: "JSON parse failed",
        modelOutputPreview: rawModelOutput.slice(0, 500)
      });
    }

    let validatedModel: any;
    try {
      validatedModel = parseDeviationResponse(parsedModel, ONTOLOGY_CATEGORIES);
    } catch (error) {
      return sendJson(res, 502, {
        ok: false,
        error: "Invalid model output",
        requestId,
        details: error instanceof Error ? error.message : "Validation failed",
        modelOutputPreview: rawModelOutput.slice(0, 500)
      });
    }

    return sendJson(res, 200, {
      ok: true,
      requestId,
      result: { ...validatedModel, model: validated.model, usedFallback: false, rawModelText: rawModelOutput },
      debug: {
        modelInput: validated.prompt,
        allowedCategories: ONTOLOGY_CATEGORIES
      }
    });
  } catch (error) {
    return sendJson(res, 500, { ok: false, error: "Internal Server Error", requestId });
  }
}
