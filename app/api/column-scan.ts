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

const runSmokeTest = async (apiKey: string): Promise<{ ok: true } | { ok: false; details: string }> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-5.2",
        messages: [
          { role: "system", content: "Return only the JSON object {\"ok\": true}." },
          { role: "user", content: "Reply with exactly: {\"ok\": true}" }
        ],
        max_tokens: 16,
        temperature: 0
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      return { ok: false, details: `${response.status} ${response.statusText}` };
    }

    return { ok: true };
  } catch (error) {
    const details = error instanceof Error ? error.message : "Unknown error";
    return { ok: false, details };
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
      console.info("[column-scan] payload", { requestId, experimentCount: null, colCount: null });
      return sendJson(res, 405, {
        ok: false,
        error: "Method Not Allowed",
        requestId
      });
    }

    const parsed = await parseBody(req);
    if (!parsed.ok || typeof parsed.body !== "object" || parsed.body === null) {
      logError(requestId, parsed.ok ? null : parsed.error, "Invalid JSON body");
      console.info("[column-scan] payload", { requestId, experimentCount: null, colCount: null });
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

    const hasKey =
      typeof process?.env?.OPENAI_API_KEY === "string" &&
      process.env.OPENAI_API_KEY.trim().length > 0;
    console.info("[column-scan] env", { requestId, hasKey });

    if (!hasKey) {
      logError(requestId, null, "Missing OPENAI_API_KEY");
      return sendJson(res, 500, {
        ok: false,
        error: "Missing OPENAI_API_KEY",
        requestId
      });
    }

    if (parsed.body.smokeTest === true) {
      const smoke = await runSmokeTest(process.env.OPENAI_API_KEY);
      if (!smoke.ok) {
        logError(requestId, new Error(smoke.details), "OpenAI call failed");
        return sendJson(res, 502, {
          ok: false,
          error: "OpenAI call failed",
          requestId,
          details: smoke.details
        });
      }

      return sendJson(res, 200, {
        ok: true,
        requestId,
        smokeTest: true
      });
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
