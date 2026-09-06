import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

// Deliberate acceptance fixture: join the disposable encrypted browser graph first.
// The browser return edit must be made in an independent client, not by this script.
const graphId = process.env.LOGSEQ_PROOF_GRAPH_ID;
assert.ok(graphId, "Provide the disposable remote graph ID, never a real notebook");
const page = "ScholarServer disposable research proof";
const browserEdit = "Browser return edit verified through MCP.";
const serverEdit = "MCP return block after receiving the browser edit.";
const token = (await readFile("/runtime/service-token", "utf8")).trim();
const client = new Client({ name: "scholarserver-logseq-sync-proof", version: "1.0.0" });

async function call(name, args = {}) {
  const result = await client.callTool({ name, arguments: args });
  assert.notEqual(result.isError, true, `Tool ${name} must succeed`);
  return JSON.parse(result.content.find((item) => item.type === "text").text);
}

try {
  await client.connect(
    new StreamableHTTPClientTransport(new URL("http://127.0.0.1:7013/mcp"), {
      requestInit: { headers: { authorization: `Bearer ${token}` } }
    })
  );
  const status = await call("graph_status");
  assert.equal(status.kv["logseq.kv/graph-uuid"], graphId, "MCP must use the same remote graph as the browser");
  assert.equal(status.kv["logseq.kv/graph-rtc-e2ee?"], true, "The shared graph must be encrypted");
  const original = JSON.stringify(await call("read_page", { page: "ScholarServer browser sync proof" }));
  assert.ok(original.includes("Edit after sync-server restart."), "Original browser note must be replicated");
  const content = JSON.stringify(await call("read_page", { page }));
  assert.ok(content.includes(browserEdit), "Independent browser edit must reach MCP");
  if (process.env.LOGSEQ_PROOF_PHASE === "restart") {
    assert.ok(
      content.includes("Browser edit after all three services restarted."),
      "Fresh edits must sync after restart"
    );
  }
  if (!content.includes(serverEdit)) {
    assert.notEqual(process.env.LOGSEQ_PROOF_PHASE, "restart", "Restart must preserve the previous MCP write");
    await call("append_block", { page, content: serverEdit });
  }
  assert.ok(JSON.stringify(await call("read_page", { page })).includes(serverEdit));
  console.log("PASS: same encrypted graph identity, browser-created note, browser return edit and MCP reply block.");
  console.log("Now verify the reply block in the independent browser; this script cannot prove delivery alone.");
} finally {
  await client.close();
}
