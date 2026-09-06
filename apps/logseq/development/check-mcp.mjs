import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

// Run inside the isolated MCP container. No account or real graph is involved.
const token = (await readFile("/runtime/service-token", "utf8")).trim();
const page = "ScholarServer disposable research proof";
const citation = "Synthetic research note — αβγ. Source: https://doi.org/10.1000/example";
const clients = [];
async function connect() {
  const client = new Client({ name: "scholarserver-logseq-proof", version: "1.0.0" });
  clients.push(client);
  await client.connect(
    new StreamableHTTPClientTransport(new URL("http://127.0.0.1:7013/mcp"), {
      requestInit: { headers: { authorization: `Bearer ${token}` } }
    })
  );
  return client;
}
async function call(client, name, args = {}) {
  const result = await client.callTool({ name: `logseq_${name}`, arguments: args });
  assert.notEqual(result.isError, true, `Tool ${name} must succeed`);
  return JSON.stringify(result);
}

try {
  assert.equal((await fetch("http://helper:8080/v1/graph", { method: "POST" })).status, 401);
  const client = await connect();
  const tools = await client.listTools();
  assert.equal(tools.tools.length, 14);
  await call(client, "graph_status");
  if (process.env.LOGSEQ_PROOF_PHASE !== "restart") {
    await call(client, "create_page", { page });
    await call(client, "append_block", { page, content: citation });
    await call(client, "create_task", { page, content: "Check this synthetic source" });
  }
  assert.ok((await call(client, "search_pages", { query: "disposable research proof" })).includes(page));
  const content = await call(client, "read_page", { page });
  assert.ok(content.includes(citation), "The graph must retain Unicode content and DOI attribution");
  assert.ok(content.includes("Check this synthetic source"), "Research task must exist");
  const second = await connect();
  await Promise.all([call(client, "read_page", { page }), call(second, "read_page", { page })]);
  console.log(
    `PASS: ${process.env.LOGSEQ_PROOF_PHASE === "restart" ? "restart persistence" : "six research tools"}, Unicode, citations, tasks, two MCP sessions and denied unauthenticated API access.`
  );
} finally {
  await Promise.all(clients.map((client) => client.close()));
}
