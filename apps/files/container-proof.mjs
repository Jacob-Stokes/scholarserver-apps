import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const token = await readFile("/runtime/service-token", "utf8");
const client = new Client({ name: "container-proof", version: "1" }, { capabilities: {} });
await client.connect(
  new StreamableHTTPClientTransport(new URL("http://127.0.0.1:7014/mcp"), {
    requestInit: { headers: { authorization: `Bearer ${token}` } }
  })
);
const call = (name, args) => client.callTool({ name: `files_${name}`, arguments: args });
assert.ok((await call("write_file", { path: "/shared/read-only/blocked.md", content: "no" })).isError);
assert.ok((await call("read_text_file", { path: "/runtime/service-token" })).isError);
assert.ok(
  !(await call("write_file", { path: "/shared/read-write/proof.md", content: "Synthetic container proof" })).isError
);
assert.ok(!(await call("read_text_file", { path: "/shared/read-only/reference.md" })).isError);
assert.ok(
  (await call("move_file", { source: "/shared/read-write/proof.md", destination: "/shared/read-only/proof.md" }))
    .isError
);
assert.equal(await readFile("/shared/read-write/proof.md", "utf8"), "Synthetic container proof");
await client.close();
console.log("Read-only mount, credential isolation, writable folder and failed-move preservation passed.");
