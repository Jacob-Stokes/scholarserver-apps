import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

// Run inside the disposable MCP container; measures the complete local MCP request.
const token = (await readFile("/runtime/service-token", "utf8")).trim();
const client = new Client({ name: "logseq-http-speed-proof", version: "1.0.0" });
const transport = new StreamableHTTPClientTransport(new URL("http://127.0.0.1:7013/mcp"), {
  requestInit: { headers: { authorization: `Bearer ${token}` } }
});
try {
  await client.connect(transport);
  const results = [];
  for (const [name, args] of [
    ["list_pages", { limit: 20 }],
    ["read_page", { page: "ScholarServer HTTP verified proof" }]
  ]) {
    const times = [];
    for (let index = 0; index < 21; index++) {
      const start = performance.now();
      const result = await client.callTool({ name, arguments: args });
      assert.notEqual(result.isError, true);
      if (index) times.push(performance.now() - start);
    }
    times.sort((a, b) => a - b);
    results.push({
      name,
      samples: 20,
      medianMs: +((times[9] + times[10]) / 2).toFixed(2),
      p95Ms: +times[18].toFixed(2)
    });
  }
  console.log(JSON.stringify(results, null, 2));
} finally {
  await client.close();
}
