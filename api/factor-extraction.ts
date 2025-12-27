const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "Missing OPENAI_API_KEY" });
    return;
  }

  const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;

  try {
    const completion = await fetch(OPENAI_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "gpt-5.2",
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "You extract normalized experiment-level factors from messy metadata. Return strict JSON with experiments[].experimentId, factors[{name,value,confidence,provenance}], warnings[]. Keep provenance snippets short."
          },
          {
            role: "user",
            content: JSON.stringify(body)
          }
        ]
      })
    });

    if (!completion.ok) {
      const errorText = await completion.text();
      res.status(500).json({ error: `OpenAI error: ${errorText}` });
      return;
    }

    const data = await completion.json();
    const content = data.choices?.[0]?.message?.content;
    const result = content ? JSON.parse(content) : {};
    res.status(200).json({ result });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Unknown factor extraction error"
    });
  }
}
