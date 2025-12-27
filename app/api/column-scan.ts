const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";

const parseContent = (content: string | null | undefined) => {
  if (!content) {
    return { ok: false, error: "Empty LLM response", raw: "" };
  }
  try {
    return { ok: true, data: JSON.parse(content) };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Unknown parse error",
      raw: content.slice(0, 500)
    };
  }
};

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
              "You identify meaningful metadata columns for kinetic experiment grouping. Return strict JSON with keys selectedColumns, columnRoles, factorCandidates, notes, uncertainties."
          },
          {
            role: "user",
            content: JSON.stringify(body)
          }
        ]
      })
    });

    const data = await completion.json();
    const content = data.choices?.[0]?.message?.content;
    const parsed = parseContent(content);
    if (!parsed.ok) {
      res.status(500).json({
        error: "LLM response was not valid JSON",
        raw: parsed.raw,
        details: parsed.error
      });
      return;
    }
    res.status(200).json({ result: parsed.data });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Unknown column scan error"
    });
  }
}
