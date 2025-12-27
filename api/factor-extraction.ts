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

  const parseContent = (content: string | null | undefined) => {
    if (!content) {
      return null;
    }
    try {
      return JSON.parse(content);
    } catch (error) {
      return { __raw: content, error: error instanceof Error ? error.message : "Unknown parse error" };
    }
  };

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
    const parsed = parseContent(content);
    if (!parsed || parsed.__raw) {
      res.status(500).json({
        error: "LLM response was not valid JSON",
        raw: typeof parsed?.__raw === "string" ? parsed.__raw.slice(0, 500) : content
      });
      return;
    }
    res.status(200).json({ result: parsed });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Unknown factor extraction error"
    });
  }
}
