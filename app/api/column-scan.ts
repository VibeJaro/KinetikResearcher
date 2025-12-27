import type { ColumnScanRequest, ColumnScanResponse } from "../src/lib/grouping/types";

const parseBody = (body: unknown): ColumnScanRequest => {
  if (!body) {
    return { columns: [], experimentCount: 0, knownStructuralColumns: [] };
  }
  if (typeof body === "string") {
    return JSON.parse(body) as ColumnScanRequest;
  }
  return body as ColumnScanRequest;
};

const respond = (res: any, status: number, payload: unknown) => {
  if (typeof res.status === "function") {
    res.status(status);
  }
  if (typeof res.json === "function") {
    res.json(payload);
  }
};

const callOpenAI = async (
  payload: ColumnScanRequest
): Promise<ColumnScanResponse | null> => {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY ?? ""}`
    },
    body: JSON.stringify({
      model: "gpt-5.2",
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You identify metadata columns for kinetic experiments. Be concise, transparent, and return strict JSON."
        },
        {
          role: "user",
          content: `Dataset summary (return selectedColumns, columnRoles, factorCandidates, notes, uncertainties): ${JSON.stringify(
            payload
          )}`
        }
      ]
    })
  });

  if (!response.ok) {
    throw new Error(`OpenAI request failed: ${response.statusText}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content;
  return content ? (JSON.parse(content) as ColumnScanResponse) : null;
};

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    respond(res, 405, { error: "Method not allowed" });
    return;
  }

  if (!process.env.OPENAI_API_KEY) {
    respond(res, 500, { error: "Missing OPENAI_API_KEY" });
    return;
  }

  const payload = parseBody(req.body);

  try {
    const parsed = await callOpenAI(payload);
    respond(res, 200, parsed ?? { error: "Empty response" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    respond(res, 500, { error: message });
  }
}
