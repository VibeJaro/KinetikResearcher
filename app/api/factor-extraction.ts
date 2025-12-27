import type {
  FactorExtractionRequest,
  FactorExtractionResponse
} from "../src/lib/grouping/types";

const parseBody = (body: unknown): FactorExtractionRequest => {
  if (!body) {
    return { factorCandidates: [], selectedColumns: [], experiments: [] };
  }
  if (typeof body === "string") {
    return JSON.parse(body) as FactorExtractionRequest;
  }
  return body as FactorExtractionRequest;
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
  payload: FactorExtractionRequest
): Promise<FactorExtractionResponse | null> => {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY ?? ""}`
    },
    body: JSON.stringify({
      model: "gpt-5.2",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You normalize messy metadata into clear factors for kinetic experiments. Return strict JSON with experiments[{experimentId, factors, warnings}] and include provenance."
        },
        {
          role: "user",
          content: `Factor extraction input: ${JSON.stringify(payload)}`
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
  return content ? (JSON.parse(content) as FactorExtractionResponse) : null;
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
