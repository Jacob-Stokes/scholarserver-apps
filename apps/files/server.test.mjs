import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { startFiles } from "./server.mjs";

test("upstream filesystem works through authenticated HTTP without client-controlled roots", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "ss-files-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const shared = path.join(root, "shared");
  const outside = path.join(root, "private.txt");
  await mkdir(shared);
  await writeFile(outside, "not-shared");
  let app = await startFiles({ roots: [shared], runtime: path.join(root, "runtime"), port: 0, host: "127.0.0.1" });
  t.after(() => app.close());
  const token = await readFile(path.join(root, "runtime/service-token"), "utf8");
  const connect = async () => {
    const client = new Client({ name: "proof", version: "1" }, { capabilities: {} });
    await client.connect(
      new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${app.port}/mcp`), {
        requestInit: { headers: { authorization: `Bearer ${token}` } }
      })
    );
    return client;
  };
  let client = await connect();
  const tools = (await client.listTools()).tools;
  assert.ok(tools.length >= 12);
  assert.ok(tools.every(({ name }) => name.startsWith("files_")));
  const call = (name, args) => client.callTool({ name: `files_${name}`, arguments: args });
  const note = path.join(shared, "note.md");
  assert.ok(!(await call("write_file", { path: note, content: "Synthetic research note" })).isError);
  assert.equal(await readFile(note, "utf8"), "Synthetic research note");
  assert.ok(!(await call("edit_file", { path: note, edits: [{ oldText: "research", newText: "edited" }] })).isError);
  const moved = path.join(shared, "moved.md");
  assert.ok(!(await call("move_file", { source: note, destination: moved })).isError);
  assert.ok((await call("read_text_file", { path: outside })).isError);
  await symlink(outside, path.join(shared, "escape.md"));
  assert.ok((await call("read_text_file", { path: path.join(shared, "escape.md") })).isError);
  assert.ok((await call("write_file", { path: path.join(shared, "../escape.txt"), content: "no" })).isError);
  await writeFile(note, "keep me");
  const collision = await call("move_file", { source: moved, destination: note });
  assert.ok(collision.isError, "moves must not overwrite an existing destination");
  assert.equal(await readFile(note, "utf8"), "keep me");
  assert.ok(!(await call("search_files", { path: shared, pattern: "*.md" })).isError);
  assert.equal((await fetch(`http://127.0.0.1:${app.port}/mcp`, { method: "POST" })).status, 401);
  await client.close();
  await app.close();
  app = await startFiles({ roots: [shared], runtime: path.join(root, "runtime"), port: 0, host: "127.0.0.1" });
  assert.equal(await readFile(path.join(root, "runtime/service-token"), "utf8"), token);
  client = await connect();
  assert.ok(!(await call("read_text_file", { path: moved })).isError);
  await client.close();
});
