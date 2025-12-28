import { randomUUID } from "crypto";

export const config = {
  runtime: "nodejs"
};

type ColumnScanBody = {
  experimentCount?: unknown;
  columns?: unknown;
  smokeTest?: unknown;
};

type EchoShape = {
  experimentCount: number | null;
  colCount: number | null;
};

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
): Promise<{ ok: true; body: ColumnScanBody } | { ok: false; error?: unknown }> => {
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

const toEcho = (body: ColumnScanBody): EchoShape => {
  const experimentCount =
    typeof body.experimentCount === "number" ? body.experimentCount : null;
  const columns = Array.isArray(body.columns) ? body.columns : null;
  const colCount = columns ? columns.length : null;
  return { experimentCount, colCount };
};

const logError = (requestId: string, error: unknown, fallbackMessage: string) => {
  const payload =
    error instanceof Error
      ? { message: error.message, stack: error.stack }
      : { message: fallbackMessage, stack: undefined };
  console.error("[column-scan] fail", { requestId, ...payload });
};

const hasOpenAIKey = (): boolean =>
  typeof process.env.OPENAI_API_KEY === "string" && process.env.OPENAI_API_KEY.trim() !== "";

const runOpenAiSmokeTest = async (apiKey: string) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25_000);
  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: "gpt-5.2",
        messages: [
          {
            role: "system",
            content:
              "Return strictly the JSON {\"ok\":true}. No explanations, no extra keys, no text."
          },
          { role: "user", content: "Respond with {\"ok\":true} only." }
        ],
        temperature: 0,
        max_tokens: 20
      })
    });

    if (!response.ok) {
      throw new Error(`status ${response.status}`);
    }

    const data = await response.json();
    const content: string | undefined = data?.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error("empty response");
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      throw new Error("non-JSON content");
    }

    if (typeof parsed !== "object" || parsed === null || (parsed as any).ok !== true) {
      throw new Error("unexpected payload");
    }

    return { ok: true as const };
  } finally {
    clearTimeout(timeout);
  }
};

export default async function handler(req: any, res: any) {
  const requestId = createRequestId();
  console.info("[column-scan] start", { requestId, method: req.method });

  try {
    if (req.method !== "POST") {
      logError(requestId, null, "Method Not Allowed");
      console.info("[column-scan] payload", {
        requestId,
        experimentCount: null,
        colCount: null
      });
      return sendJson(res, 405, {
        ok: false,
        error: "Method Not Allowed",
        requestId
      });
    }

    const parsed = await parseBody(req);
    if (!parsed.ok || typeof parsed.body !== "object" || parsed.body === null) {
      logError(requestId, parsed.ok ? null : parsed.error, "Invalid JSON body");
      console.info("[column-scan] payload", {
        requestId,
        experimentCount: null,
        colCount: null
      });
      return sendJson(res, 400, {
        ok: false,
        error: "Invalid JSON body",
        requestId
      });
    }

    const echo = toEcho(parsed.body);
    console.info("[column-scan] payload", {
      requestId,
      experimentCount: echo.experimentCount,
      colCount: echo.colCount
    });

    const keyAvailable = hasOpenAIKey();
    console.info("[column-scan] env", { requestId, hasKey: keyAvailable });

    if (!keyAvailable) {
      logError(requestId, null, "Missing OPENAI_API_KEY");
      return sendJson(res, 500, {
        ok: false,
        error: "Missing OPENAI_API_KEY",
        requestId
      });
    }

    if (parsed.body.smokeTest === true) {
      try {
        await runOpenAiSmokeTest(process.env.OPENAI_API_KEY as string);
        return sendJson(res, 200, { ok: true, requestId, smokeTest: true });
      } catch (error) {
        logError(requestId, error, "OpenAI call failed");
        const message = error instanceof Error ? error.message : "OpenAI call failed";
        return sendJson(res, 502, {
          ok: false,
          error: "OpenAI call failed",
          requestId,
          details: message
        });
      }
    }

    return sendJson(res, 200, {
      ok: true,
      requestId,
      echo
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
