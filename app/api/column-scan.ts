// @ts-nocheck
import type { ColumnScanRequest, ColumnScanResult } from "../src/lib/grouping/types";
import { emptyColumnScanResult } from "../src/lib/grouping/columnScan";

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
      throw new Error("LLM request failed");
    }

    const json = await response.json();
    const result = json?.choices?.[0]?.message?.content;
    const parsed: ColumnScanResult = result ? JSON.parse(result) : emptyColumnScanResult;

    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(parsed));
  } catch (error) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: error?.message ?? "LLM request failed" }));
  }
}
