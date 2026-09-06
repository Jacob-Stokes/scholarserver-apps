import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

// Require the operator to name the disposable graph before any test write.
const graphId = process.env.LOGSEQ_PROOF_GRAPH_ID;
assert.match(graphId ?? "", /^[a-f0-9-]{36}$/, "Provide the disposable graph ID");
const page = process.env.LOGSEQ_PROOF_PAGE ?? "FreshCatalogAcceptance";
const phase = process.env.LOGSEQ_PROOF_PHASE ?? "read";
assert.ok(["read", "append", "absent"].includes(phase), "Unknown proof phase");
const marker = process.env.LOGSEQ_PROOF_MARKER;
const client = new Client({ name: "logseq-recovery-proof", version: "1.0.0" });
const token = (await readFile("/runtime/service-token", "utf8")).trim();
async function call(name, args = {}) {
  const result = await client.callTool({ name, arguments: args });
  assert.notEqual(result.isError, true, `${name} must succeed`);
  return JSON.parse(result.content.find((item) => item.type === "text").text);
}
try {
  await client.connect(
    new StreamableHTTPClientTransport(new URL("http://127.0.0.1:7013/mcp"), {
      requestInit: { headers: { authorization: `Bearer ${token}` } }
    })
  );
  const graph = await call("graph_status");
  assert.equal(graph.kv["logseq.kv/graph-uuid"], graphId);
  assert.equal(graph.kv["logseq.kv/graph-rtc-e2ee?"], true);
  if (phase === "append") {
    assert.ok(marker, "Provide a unique synthetic marker");
    assert.ok(!JSON.stringify(await call("read_page", { page })).includes(marker), "Do not duplicate proof data");
    await call("append_block", { page, content: marker });
  }
  const result = await call("read_page", { page });
  function countMarker(block) {
    const ownMatch = marker && block["block/title"]?.includes(marker) ? 1 : 0;
    return ownMatch + (block["block/children"] ?? []).reduce((count, child) => count + countMarker(child), 0);
  }
  if (marker)
    assert.equal(
      countMarker(result.root),
      phase === "absent" ? 0 : 1,
      "Expected exactly one marker, or none after rollback"
    );
  console.log(JSON.stringify({ phase, encryptedGraphVerified: true, markerVerified: Boolean(marker) }));
} finally {
  await client.close();
}
