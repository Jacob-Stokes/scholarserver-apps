import { randomUUID } from "node:crypto";

// This is a transport adapter to upstream MCP, not a replacement PDF engine.
export function nativeClient(apiKey, fetcher = fetch) {
  if (!apiKey || /[\r\n]/.test(apiKey)) throw new Error("A private Stirling API key is required.");
  return async (name, args) => {
    if (!["stirling_pages", "stirling_security"].includes(name)) throw new Error("Tool unavailable.");
    const id = randomUUID();
    const response = await fetcher("http://stirling:8080/mcp", {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(30_000),
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        "mcp-protocol-version": "2025-06-18",
        "x-api-key": apiKey
      },
      body: JSON.stringify({ jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: args } })
    });
    if (!response.ok || !response.body) throw new Error("Native result unavailable.");
    const chunks = [];
    let size = 0;
    for await (const chunk of response.body) {
      size += chunk.byteLength;
      if (size > 3_000_000) throw new Error("Native result exceeded the draft limit.");
      chunks.push(chunk);
    }
    const message = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (message.id !== id || message.error || !message.result || message.result.isError) {
      throw new Error("Native operation did not return a confirmed result.");
    }
    return message.result;
  };
}
