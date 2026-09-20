// The ONE place in this project that talks to an AI model.
//
// SERVER-SIDE ONLY: it reads secret keys. Never import it into a "use client" file.
// Used by scripts/market-maker.mjs now, and by the /sidekick server code later.
//
// Pick the model with AI_PROVIDER in .env.local:
//   databricks (default) -> our Databricks model serving endpoint
//   claude               -> the Claude API (backup if Databricks is down)
//
// Note: this file avoids TypeScript-only features (enums etc.) on purpose, so
// plain Node can run it too (Node 24 strips the types itself).

// Send one question, get back the AI's reply as plain text.
export async function askAI(system: string, user: string): Promise<string> {
  const provider = (process.env.AI_PROVIDER ?? "databricks").trim().toLowerCase();
  if (provider === "databricks") return askDatabricks(system, user);
  if (provider === "claude") return askClaude(system, user);
  throw new Error(`AI_PROVIDER must be "databricks" or "claude" (got "${provider}")`);
}

// The AI is asked for JSON, but models sometimes add ```json fences or a chatty
// sentence around it. Cut the reply down to the outermost { ... } and parse it.
// This only PARSES. Callers must still check every field before using it.
export function parseAIJson(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("AI reply did not contain a JSON object");
  return JSON.parse(text.slice(start, end + 1));
}

// ---------- Databricks ----------
// Databricks chat models use the same message format as OpenAI:
// POST <host>/serving-endpoints/<endpoint name>/invocations with a Bearer token.
async function askDatabricks(system: string, user: string): Promise<string> {
  let host = (process.env.DATABRICKS_HOST ?? "").trim().replace(/\/+$/, "");
  const token = process.env.DATABRICKS_TOKEN;
  const model = process.env.DATABRICKS_MODEL || "databricks-llama-4-maverick";
  if (!host || !token) throw new Error("DATABRICKS_HOST and DATABRICKS_TOKEN must be set");
  // People often paste the host without "https://", so add it if missing.
  if (!/^https?:\/\//.test(host)) host = `https://${host}`;

  const res = await fetch(`${host}/serving-endpoints/${model}/invocations`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      max_tokens: 1000,
      temperature: 0.7,
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`Databricks returned ${res.status}: ${(await res.text()).slice(0, 300)}`);

  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  if (typeof text !== "string") throw new Error("Databricks reply had no message text");
  return text;
}

// ---------- Claude ----------
async function askClaude(system: string, user: string): Promise<string> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY must be set");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001",
      max_tokens: 1000,
      system,
      messages: [{ role: "user", content: user }],
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`Claude returned ${res.status}: ${(await res.text()).slice(0, 300)}`);

  const data = await res.json();
  const text = (data?.content ?? [])
    .filter((block: { type: string }) => block.type === "text")
    .map((block: { text: string }) => block.text)
    .join("");
  if (!text) throw new Error("Claude reply had no text");
  return text;
}
