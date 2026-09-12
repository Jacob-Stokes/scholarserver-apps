import assert from "node:assert/strict";
import { createServer, request } from "node:http";
import test from "node:test";
import { handleLocalApiBridge } from "./bridge.mjs";

test("standalone relay rejects unknown routes and missing tokens, and preserves Zotero authorization", async (t) => {
  const received = [];
  const upstream = createServer((req, res) => {
    received.push({ url: req.url, headers: req.headers, method: req.method });
    res.writeHead(401, {
      "WWW-Authenticate": 'Zotero-API-Key realm="Zotero Local API"',
      "Zotero-Server-ID": "synthetic-id"
    });
    res.end("Zotero rejected the local write");
  });
  await new Promise((resolve) => upstream.listen(0, "127.0.0.1", resolve));
  const relay = createServer(
    (req, res) =>
      void handleLocalApiBridge(req, res, {
        readToken: async () => "synthetic-bridge-token",
        // The fixture never connects to the personal desktop's port 23119.
        send: (options, callback) => request({ ...options, port: upstream.address().port }, callback)
      })
  );
  await new Promise((resolve) => relay.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    relay.closeAllConnections();
    upstream.closeAllConnections();
    await Promise.all([
      new Promise((resolve) => relay.close(resolve)),
      new Promise((resolve) => upstream.close(resolve))
    ]);
  });
  const base = `http://127.0.0.1:${relay.address().port}`;
  assert.equal((await fetch(`${base}/health`)).status, 200);
  assert.equal((await fetch(`${base}/api`)).status, 401);
  assert.equal((await fetch(`${base}/api/items`, { headers: { "X-ScholarServer-Bridge": "wrong" } })).status, 401);
  assert.equal((await fetch(`${base}/api/account/start`)).status, 401);
  assert.equal((await fetch(`${base}/configuration`)).status, 404);
  assert.equal(received.length, 0);
  const result = await fetch(`${base}/api/users/123/items`, {
    method: "POST",
    headers: {
      "X-ScholarServer-Bridge": "synthetic-bridge-token",
      "Zotero-API-Key": "synthetic-local-key",
      "Zotero-Server-ID": "synthetic-id",
      "Content-Type": "application/json"
    },
    body: "[]"
  });
  assert.equal(result.status, 401);
  assert.equal(result.headers.get("zotero-server-id"), "synthetic-id");
  assert.equal(received[0].headers["x-scholarserver-bridge"], undefined);
  assert.equal(received[0].headers["zotero-api-key"], "synthetic-local-key");
  assert.equal(received[0].method, "POST");
  assert.equal(received[0].url, "/api/users/123/items");
});
