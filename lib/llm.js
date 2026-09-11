// Minimal OpenAI-compatible chat client. No SDK, one function.
// Env: SPECMINE_BASE_URL/SPECMINE_API_KEY/SPECMINE_MODEL, or
// AMAZEEAI_BASE_URL/AMAZEEAI_API_KEY (SPECMINE_MODEL still picks the model).

export function llmConfig() {
  const baseUrl = process.env.SPECMINE_BASE_URL || process.env.AMAZEEAI_BASE_URL;
  const apiKey = process.env.SPECMINE_API_KEY || process.env.AMAZEEAI_API_KEY;
  const model = process.env.SPECMINE_MODEL;
  if (!baseUrl || !apiKey || !model) {
    throw new Error(
      `AI endpoint not configured. Set SPECMINE_MODEL and either SPECMINE_BASE_URL/SPECMINE_API_KEY ` +
        `or AMAZEEAI_BASE_URL/AMAZEEAI_API_KEY. List available models with: ` +
        `curl -H "Authorization: Bearer $KEY" ${baseUrl || "$BASE_URL"}/models`
    );
  }
  return { baseUrl: baseUrl.replace(/\/$/, ""), apiKey, model };
}

/** chat([{role,content}...], {json}) -> content string. Retries once on 429/5xx. */
export async function chat(messages, { json = false, maxTokens = 4096 } = {}) {
  const { baseUrl, apiKey, model } = llmConfig();
  const body = {
    model,
    messages,
    max_tokens: maxTokens,
    ...(json ? { response_format: { type: "json_object" } } : {}),
  };
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(180_000),
    });
    if (res.ok) {
      const data = await res.json();
      const content = data.choices?.[0]?.message?.content;
      if (typeof content === "string") return content;
      throw new Error(`unexpected endpoint response: ${JSON.stringify(data).slice(0, 300)}`);
    }
    if (res.status !== 429 && res.status < 500) {
      throw new Error(`endpoint ${res.status}: ${(await res.text()).slice(0, 300)}`);
    }
    if (attempt === 0) await new Promise((r) => setTimeout(r, 3000));
    else throw new Error(`endpoint ${res.status} after retry`);
  }
}

/** chat with response_format json_object; falls back to extracting a JSON block. */
export async function chatJson(messages, opts = {}) {
  const raw = await chat(
    [
      ...messages,
      { role: "system", content: "Respond with a single JSON object. No prose." },
    ],
    { json: true, ...opts }
  );
  try {
    return JSON.parse(raw);
  } catch {
    const m = raw.match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0]);
    throw new Error(`model did not return JSON: ${raw.slice(0, 200)}`);
  }
}
