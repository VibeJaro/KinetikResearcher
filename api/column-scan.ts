// @ts-nocheck
import type { ColumnScanRequest, ColumnScanResult } from "../app/src/lib/grouping/types";
import { emptyColumnScanResult } from "../app/src/lib/grouping/columnScan";

const parseBody = async (req: any): Promise<ColumnScanRequest | null> => {
  if (!req) return null;
  try {
    if (typeof req.body === "string") {
      return JSON.parse(req.body);
    }
    if (req.body && typeof req.body === "object") {
      return req.body as ColumnScanRequest;
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
    "You are a chemometrics assistant. Identify columns relevant for grouping kinetic experiments.",
    "Return strict JSON with selectedColumns, columnRoles, factorCandidates, notes, uncertainties.",
    "Roles: condition | comment | unknown.",
    "Factor candidates should include reaction conditions (catalyst, additive, substrate, solvent, temperature, batch, note)."
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
      const errorMessage = text || "LLM request failed";
      console.error("Column scan upstream error:", errorMessage);
      res.statusCode = response.status;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: errorMessage }));
      return;
    }

    const json = await response.json();
    const result = json?.choices?.[0]?.message?.content;
    if (!result) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Empty LLM response" }));
      return;
    }
    let parsed: ColumnScanResult = emptyColumnScanResult;
    try {
      parsed = JSON.parse(result) as ColumnScanResult;
    } catch (error) {
      console.error("Column scan parse error:", error, result);
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Failed to parse LLM response" }));
      return;
    }

    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(parsed));
  } catch (error) {
    console.error("Column scan handler error:", error);
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: error?.message ?? "LLM request failed" }));
  }
}
