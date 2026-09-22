import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import test from "node:test";

test("actual shared HTTP transport rejects absent/wrong bearer and authenticates draft discovery", {
  timeout: 15_000
}, async (t) => {
  const reservation = createServer();
  reservation.listen(0, "127.0.0.1");
  await once(reservation, "listening");
  const port = reservation.address().port;
  await new Promise((resolve) => reservation.close(resolve));
  const child = spawn(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `
    import { startMcp } from 'mcp-common';
    import { paperlessTools } from './tools.mjs';
    await startMcp({ name: 'paperless-auth-test', port: ${port}, bearerToken: 'synthetic-test-only', tools: paperlessTools({}) });
  `
    ],
    { cwd: new URL("./", import.meta.url), stdio: ["ignore", "pipe", "pipe"] }
  );
  t.after(async () => {
    if (child.exitCode === null) {
      const stopped = once(child, "exit");
      child.kill();
      await stopped;
    }
  });
  await Promise.race([
    once(child.stdout, "data"),
    once(child, "exit").then(() => {
      throw new Error("Mock MCP failed to start");
    })
  ]);
  const endpoint = `http://127.0.0.1:${port}/mcp`;
  const headers = { "content-type": "application/json", accept: "application/json, text/event-stream" };
  const body = JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "draft-test", version: "1" } }
  });
  for (const authorization of [undefined, "Bearer wrong"]) {
    const requestHeaders = { ...headers };
    if (authorization) requestHeaders.authorization = authorization;
    const response = await fetch(endpoint, { method: "POST", headers: requestHeaders, body });
    assert.equal(response.status, 401);
    await response.text();
  }
  const authorized = { ...headers, authorization: "Bearer synthetic-test-only" };
  const initialized = await fetch(endpoint, { method: "POST", headers: authorized, body });
  assert.equal(initialized.status, 200);
  const session = initialized.headers.get("mcp-session-id");
  await initialized.text();
  const listHeaders = { ...authorized };
  if (session) listHeaders["mcp-session-id"] = session;
  const listed = await fetch(endpoint, {
    method: "POST",
    headers: listHeaders,
    body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} })
  });
  assert.equal(listed.status, 200);
  const output = await listed.text();
  for (const name of ["paperless_search_documents", "paperless_get_document", "paperless_get_document_text"])
    assert.ok(output.includes(name));
  assert.doesNotMatch(output, /paperless_upload|paperless_delete/);
});
