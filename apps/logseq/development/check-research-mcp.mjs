import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

// Run only in the disposable MCP container. Never point this at a researcher's graph.
const page = process.env.LOGSEQ_PROOF_PAGE ?? "ScholarServer API decision proof";
const original = "Synthetic source — αβγ https://doi.org/10.1000/example";
const edited = `${original} Reviewed through MCP.`;
const child = "Nested methods note — synthetic only.";
const task = `Review the synthetic paper (${page})`;
const token = (await readFile("/runtime/service-token", "utf8")).trim();
const client = new Client({ name: "logseq-research-proof", version: "1.0.0" });
const transport = new StreamableHTTPClientTransport(new URL("http://127.0.0.1:7013/mcp"), {
  requestInit: { headers: { authorization: `Bearer ${token}` } }
});

async function call(name, args = {}) {
  const result = await client.callTool({ name: `logseq_${name}`, arguments: args });
  assert.notEqual(result.isError, true, `${name} must succeed`);
  const content = result.content.find((item) => item.type === "text");
  return JSON.parse(content.text);
}

try {
  await client.connect(transport);
  assert.equal((await client.listTools()).tools.length, 14);
  const metadata = await call("graph_status");
  if (process.env.LOGSEQ_PROOF_GRAPH_ID) {
    assert.equal(metadata.kv["logseq.kv/graph-uuid"], process.env.LOGSEQ_PROOF_GRAPH_ID);
    assert.equal(metadata.kv["logseq.kv/graph-rtc-e2ee?"], true);
  }
  if (process.env.LOGSEQ_PROOF_PHASE !== "restart") {
    const existing = await call("search_pages", { query: page });
    assert.ok(!JSON.stringify(existing).includes(page), "Fresh proof must not overwrite an earlier proof page");
    await call("create_page", { page });
    await call("append_block", { page, content: original });
    const root = (await call("read_page", { page })).root;
    const id = root["block/children"][0]["db/id"];
    await call("append_child_block", { id, content: child });
    await call("update_block", { id, content: edited });
    const block = (await call("read_block", { id })).root;
    assert.equal(block["block/title"], edited);
    assert.equal(block["block/children"][0]["block/title"], child, "Editing must retain children");
    await call("create_task", { page, content: task });
    const tasks = (await call("list_tasks", { limit: 100 })).items;
    const taskId = tasks.find((item) => item["block/title"] === task)["db/id"];
    const statuses = (await call("list_task_statuses")).result;
    const done = statuses.find((item) => item["db/ident"] === "logseq.property/status.done")["db/ident"];
    await call("set_task_status", { id: taskId, status: done });
    const rejected = await client.callTool({
      name: "logseq_set_task_status",
      arguments: { id: taskId, status: "not-a-real-status" }
    });
    assert.equal(rejected.isError, true, "Upstream must reject an invalid status");
    const invalidId = await client.callTool({ name: "logseq_read_block", arguments: { id: -1 } });
    assert.equal(invalidId.isError, true);
    const referencePage = `${page} reference`;
    const appended = await call("append_block", { page, content: `Linked synthetic source [[${referencePage}]]` });
    const linkedId = appended.result[0];
    for (let edit = 0; edit < 3; edit++) {
      const content = `Updated synthetic source ${edit} [[${referencePage}]]`;
      await call("update_block", { id: linkedId, content });
      const references = (await call("read_page", { page: referencePage }))["linked-references"];
      assert.ok(
        references.blocks.some((item) => item["db/id"] === linkedId),
        "Repeated edits must preserve backlinks"
      );
      assert.ok(!JSON.stringify(references).includes("datascript/Entity"), "References must be plain JSON");
      assert.equal((await call("read_block", { id: linkedId })).root["block/title"], content);
    }
  }
  const first = await call("list_pages", { limit: 1, offset: 0 });
  const second = await call("list_pages", { limit: 1, offset: 1 });
  assert.equal(first.items.length, 1);
  assert.equal(second.items.length, 1);
  assert.notEqual(first.items[0]["db/id"], second.items[0]["db/id"]);
  const matches = await call("search_blocks", { query: "Reviewed through MCP" });
  assert.ok(JSON.stringify(matches).includes(edited));
  const content = await call("read_page", { page });
  assert.ok(JSON.stringify(content).includes(child));
  const backlinks = (await call("read_page", { page: `${page} reference` }))["linked-references"];
  assert.ok(
    backlinks.blocks.some((item) => item["block/title"].includes("Updated synthetic source 2")),
    "Backlinks survive restart and synchronization"
  );
  const tasks = (await call("list_tasks", { limit: 100 })).items;
  assert.equal(
    tasks.find((item) => item["block/title"] === task)["logseq.property/status"],
    "logseq.property/status.done"
  );
  if (process.env.LOGSEQ_BROWSER_MARKER) {
    assert.ok(JSON.stringify(content).includes(process.env.LOGSEQ_BROWSER_MARKER), "Browser edit must reach MCP");
  }
  console.log(
    "PASS: 14 MCP tools; nested edit preserves children, Unicode/citation search, pagination, task completion and invalid-input rejection. Restart phase checks persisted data."
  );
} finally {
  await client.close();
}
