"use strict";

const DEFAULT_OPENAI_V1 = "https://api.openai.com/v1";

/**
 * @param {object} opts
 * @param {string} opts.baseUrl
 * @param {string} opts.apiKey
 * @param {string} opts.model
 * @param {string} opts.prompt
 * @param {(t: string) => void} opts.onDelta
 * @param {AbortSignal} [opts.signal]
 */
async function streamOpenAIChat(opts) {
  const base = (opts.baseUrl || DEFAULT_OPENAI_V1).replace(/\/+$/, "");
  const url = `${base}/chat/completions`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${opts.apiKey}`,
    },
    body: JSON.stringify({
      model: opts.model,
      messages: [{ role: "user", content: opts.prompt }],
      stream: true,
    }),
    signal: opts.signal,
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error((t || res.statusText || `HTTP ${res.status}`).slice(0, 800));
  }
  if (!res.body) throw new Error("Empty response body");
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const parts = buf.split("\n");
    buf = parts.pop() || "";
    for (let line of parts) {
      line = line.trim();
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (payload === "[DONE]") continue;
      try {
        const j = JSON.parse(payload);
        const choice = j.choices?.[0];
        const d = choice?.delta?.content ?? choice?.message?.content;
        if (typeof d === "string" && d) opts.onDelta(d);
      } catch {
        /* ignore partial JSON */
      }
    }
  }
}

/**
 * Anthropic Messages API streaming (SSE JSON lines).
 * @param {object} opts
 * @param {string} opts.apiKey
 * @param {string} opts.model
 * @param {string} opts.prompt
 * @param {(t: string) => void} opts.onDelta
 * @param {AbortSignal} [opts.signal]
 */
async function streamAnthropicChat(opts) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": opts.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: opts.model,
      max_tokens: Math.min(8192, 4096),
      stream: true,
      messages: [{ role: "user", content: opts.prompt }],
    }),
    signal: opts.signal,
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error((t || res.statusText || `HTTP ${res.status}`).slice(0, 800));
  }
  if (!res.body) throw new Error("Empty response body");
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let idx;
    while ((idx = buf.indexOf("\n")) !== -1) {
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (payload === "[DONE]") continue;
      try {
        const j = JSON.parse(payload);
        if (j.type === "content_block_delta" && j.delta?.type === "text_delta" && j.delta.text) {
          opts.onDelta(j.delta.text);
        }
      } catch {
        /* ignore */
      }
    }
  }
}

module.exports = { streamOpenAIChat, streamAnthropicChat, DEFAULT_OPENAI_V1 };
