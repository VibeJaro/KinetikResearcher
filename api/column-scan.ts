import { randomUUID } from "crypto";

type ColumnScanPayload = {
  experimentCount?: unknown;
  columns?: unknown;
  knownStructuralColumns?: unknown;
};

export const config = {
  runtime: "nodejs20.x"
};

const parseJsonBody = async (req: any): Promise<Record<string, unknown>> => {
  if (req.body !== undefined) {
    if (typeof req.body === "string") {
      return JSON.parse(req.body);
    }
    if (typeof req.body === "object") {
      return req.body as Record<string, unknown>;
    }
  }

  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }

  const rawBody = Buffer.concat(chunks).toString("utf8").trim();
  if (!rawBody) {
    throw new Error("Empty body");
  }

  return JSON.parse(rawBody);
};

export default async function handler(req: any, res: any) {
  const requestId = randomUUID();
  console.info("[column-scan] start", { requestId, method: req.method });

  if (req.method !== "POST") {
    console.info("[column-scan] payload", {
      requestId,
      experimentCount: null,
      colCount: null
    });
    return res.status(405).json({ ok: false, error: "Method Not Allowed", requestId });
  }

  let body: Record<string, unknown>;

  try {
    body = await parseJsonBody(req);
  } catch (error) {
    console.error("[column-scan] error", {
      requestId,
      message: error instanceof Error ? error.message : "Invalid JSON body",
      stack: error instanceof Error ? error.stack : undefined
    });
    console.info("[column-scan] payload", { requestId, experimentCount: null, colCount: null });
    return res.status(400).json({ ok: false, error: "Invalid JSON body", requestId });
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    console.error("[column-scan] error", {
      requestId,
      message: "Invalid JSON body"
    });
    console.info("[column-scan] payload", { requestId, experimentCount: null, colCount: null });
    return res.status(400).json({ ok: false, error: "Invalid JSON body", requestId });
  }

  const payload = body as ColumnScanPayload;

  const experimentCount =
    typeof payload.experimentCount === "number" ? payload.experimentCount : null;
  const colCount = Array.isArray(payload.columns) ? payload.columns.length : null;

  console.info("[column-scan] payload", { requestId, experimentCount, colCount });

  return res.status(200).json({
    ok: true,
    requestId,
    echo: {
      experimentCount,
      colCount
    }
  });
}
