declare const process: {
  env?: Record<string, string | undefined>;
};

type ApiRequest = {
  method?: string;
  body?: unknown;
};

type ApiResponse = {
  status: (code: number) => ApiResponse;
  json: (data: unknown) => void;
};

const parseBody = (body: unknown) => {
  if (typeof body === "string") {
    try {
      return JSON.parse(body);
    } catch {
      return null;
    }
  }
  return body;
};

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const payload = parseBody(req.body);
  const apiKey = process?.env?.OPENAI_API_KEY;

  if (!apiKey) {
    res.status(500).json({ error: "Missing OpenAI API key" });
    return;
  }

  if (!payload) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const messages = [
    {
      role: "system",
      content:
        "You are a chemistry-aware data analyst. Given spreadsheet column summaries, propose which columns are relevant for grouping kinetic experiments. Respond with strict JSON and keep it concise."
    },
    {
      role: "user",
      content:
        "Select relevant columns for grouping experiments. Prefer columns describing conditions (catalyst, additive, substrate, solvent, temperature, batch). Include notes and uncertainties."
    },
    {
      role: "user",
      content: JSON.stringify(payload)
    }
  ];

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "gpt-5.2",
        messages,
        temperature: 0.1,
        response_format: { type: "json_object" }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      res.status(response.status).json({ error: errorText || "OpenAI request failed" });
      return;
    }

    const result = await response.json();
    const content = result?.choices?.[0]?.message?.content;
    if (!content) {
      res.status(502).json({ error: "Empty response from model" });
      return;
    }

    res.status(200).json(JSON.parse(content));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ error: message });
  }
}
