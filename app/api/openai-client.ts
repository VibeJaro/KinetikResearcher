type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type ChatRequest = {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  max_completion_tokens?: number;
  response_format?: { type: "json_object" | "text" };
};

type ChatResponse = {
  content: string;
  raw: unknown;
};

export class OpenAIError extends Error {
  status?: number;
  details?: string;

  constructor(message: string, status?: number, details?: string) {
    super(message);
    this.name = "OpenAIError";
    this.status = status;
    this.details = details;
  }
}

export async function createChatCompletion(
  request: ChatRequest,
  signal?: AbortSignal
): Promise<ChatResponse> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY ?? ""}`
    },
    body: JSON.stringify(request),
    signal
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new OpenAIError(`OpenAI ${res.status}`, res.status, text);
  }

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content ?? "";
  return { content, raw: data };
}
