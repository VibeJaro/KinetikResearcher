// @ts-nocheck
import type {
  FactorExtractionRequest,
  FactorExtractionResponse,
  FactorValue
} from "../app/src/lib/grouping/types";
import { emptyFactorExtractionResponse } from "../app/src/lib/grouping/factorExtraction";

const parseBody = async (req: any): Promise<FactorExtractionRequest | null> => {
  if (!req) return null;
  try {
    if (typeof req.body === "string") {
      return JSON.parse(req.body);
    }
    if (req.body && typeof req.body === "object") {
      return req.body as FactorExtractionRequest;
    }
    const chunks: Uint8Array[] = [];
    for await (const chunk of req) {
      chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
    }
    const raw = Buffer.concat(chunks).toString("utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

const sanitizeFactor = (factor: FactorValue) => ({
  ...factor,
  provenance: (factor.provenance ?? []).map((entry) => ({
    column: entry.column,
    rawValueSnippet:
      typeof entry.rawValueSnippet === "string"
        ? entry.rawValueSnippet.slice(0, 160)
        : entry.rawValueSnippet === null
          ? ""
          : String(entry.rawValueSnippet)
  }))
});

export default async function handler(req: any, res: any) {
  if (req?.method && req.method !== "POST") {
    res.statusCode = 405;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Method not allowed" }));
    return;
  }

  if (!process.env.OPENAI_API_KEY) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "OPENAI_API_KEY is missing" }));
    return;
  }

  const payload = await parseBody(req);
  if (!payload) {
    res.statusCode = 400;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Invalid payload" }));
    return;
  }

  const systemPrompt = [
    "You are a chemometrics assistant. Extract normalized factors for kinetic experiments.",
    "Factor names come from factorCandidates; prefer values that can group experiments.",
    "Return strict JSON with experiments -> factors[name, value, confidence, provenance].",
    "Use provenance list with column and rawValueSnippet. Include warnings when inferring from comments.",
    "Confidence: high | medium | low."
  ].join("\n");

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY ?? ""}`
      },
      body: JSON.stringify({
        model: "gpt-5.2",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: JSON.stringify(payload) }
        ],
        response_format: { type: "json_object" }
      })
    });

    if (!response.ok) {
      const text = await response.text();
      res.statusCode = response.status;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: text || "LLM request failed" }));
      return;
    }

    const json = await response.json();
    const result = json?.choices?.[0]?.message?.content;
    const parsed: FactorExtractionResponse = result
      ? JSON.parse(result)
      : emptyFactorExtractionResponse;

    const sanitized: FactorExtractionResponse = {
      experiments: parsed.experiments.map((experiment) => ({
        ...experiment,
        factors: experiment.factors.map(sanitizeFactor)
      }))
    };

    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(sanitized));
  } catch (error) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: error?.message ?? "LLM request failed" }));
  }
}
