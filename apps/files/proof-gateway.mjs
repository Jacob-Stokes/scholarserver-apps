// Run only against a disposable installation, after attaching synthetic storage.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const address = process.env.FILES_PROOF_GATEWAY;
if (!address) throw new Error("Set FILES_PROOF_GATEWAY to the disposable Gateway MCP URL");
const client = new Client({ name: "files-acceptance", version: "1" }, { capabilities: {} });
await client.connect(new StreamableHTTPClientTransport(new URL(address)));
try {
  const { tools } = await client.listTools();
  assert.equal(tools.filter((tool) => tool.name.startsWith("files_")).length, 13);
  assert.ok(!tools.some((tool) => /delete|shell|execute/.test(tool.name)));
  const call = (name, args) => client.callTool({ name: `files_${name}`, arguments: args });
  const directory = `/shared/read-write/files-acceptance-${randomUUID()}`;
  const created = await call("create_directory", { path: directory });
  assert.ok(!created.isError, JSON.stringify(created));
  const source = `${directory}/draft.md`;
  const destination = `${directory}/reviewed.md`;
  const written = await call("write_file", { path: source, content: "Synthetic Files proof: initial note." });
  assert.ok(!written.isError, JSON.stringify(written));
  const edited = await call("edit_file", {
    path: source,
    edits: [{ oldText: "initial note", newText: "reviewed note" }]
  });
  assert.ok(!edited.isError, JSON.stringify(edited));
  const moved = await call("move_file", { source, destination });
  assert.ok(!moved.isError, JSON.stringify(moved));
  const read = await call("read_text_file", { path: destination });
  assert.ok(!read.isError);
  assert.match(JSON.stringify(read.content), /reviewed note/);
  assert.ok((await call("write_file", { path: "/shared/read-only/blocked.md", content: "No" })).isError);
  assert.ok((await call("read_text_file", { path: "/runtime/service-token" })).isError);
  assert.ok((await call("read_text_file", { path: "/shared/read-write/../../runtime/service-token" })).isError);
  const found = await call("search_files", { path: "/shared/read-write", pattern: "**/reviewed.md" });
  assert.ok(!found.isError);
  assert.match(JSON.stringify(found.content), /reviewed.md/);
  console.log(
    "Gateway: 13 tools; create, write, edit, move, read and search passed. Read-only and credential boundaries held."
  );
} finally {
  await client.close();
}
