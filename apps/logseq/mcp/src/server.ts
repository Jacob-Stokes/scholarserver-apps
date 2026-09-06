import { readFile } from "node:fs/promises";
import { startMcp } from "mcp-common";
import { graphTools } from "./tools.js";

async function serviceToken(): Promise<string> {
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      const value = (await readFile("/runtime/service-token", "utf8")).trim();
      if (value.length >= 32) return value;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw new Error("Cannot read the service credential.");
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("The graph helper has not created its service credential.");
}

const token = await serviceToken();
const base = process.env.LOGSEQ_API_URL ?? "http://helper:8080";
await startMcp({
  name: "logseq-mcp",
  version: "0.1.0",
  port: Number(process.env.PORT ?? 7013),
  bearerToken: token,
  instructions:
    "Work with the server's Logseq database graph. Search and read before adding research notes. Preserve source attribution. Do not claim device sync succeeded based on a successful local write. Never repeat a timed-out write without inspecting its outcome.",
  tools: graphTools(async (operation, input) => {
    const response = await fetch(`${base}/v1/graph`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ operation, input }),
      signal: AbortSignal.timeout(65_000),
      redirect: "error"
    });
    const result = (await response.json()) as { data?: unknown; error?: string };
    if (!response.ok) throw new Error(result.error ?? "Logseq could not complete the operation.");
    return result.data;
  })
});
