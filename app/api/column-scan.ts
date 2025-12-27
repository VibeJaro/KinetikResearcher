import { randomUUID } from "crypto";

export const config = {
  runtime: "nodejs"
};

type ColumnScanBody = {
  experimentCount?: unknown;
  columns?: unknown;
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
  console.error("[column-scan] error", { requestId, ...payload });
};

export default async function handler(req: any, res: any) {
  const requestId = createRequestId();
  console.info("[column-scan] start", { requestId, method: req.method });

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

  return sendJson(res, 200, {
    ok: true,
    requestId,
    echo
  });
}
