import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { graphServer, initializeGraph } from "./server.mjs";

test("the private API requires its service credential before running any graph command", async (t) => {
  const calls = [];
  const token = "test-only-token-with-at-least-32-characters";
  const server = graphServer({
    token,
    runner: {
      run: async (args) => {
        calls.push(args);
        return { result: [1] };
      }
    }
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => {
    server.closeAllConnections();
    server.close();
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  assert.equal((await fetch(`${base}/health`)).status, 200);
  assert.equal((await fetch(`${base}/v1/graph`, { method: "POST" })).status, 401);
  assert.equal(calls.length, 0);
  const send = (body) =>
    fetch(`${base}/v1/graph`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body
    });
  assert.equal((await send("not json")).status, 400);
  assert.equal((await send(JSON.stringify({ operation: "exec", input: { command: "rm" } }))).status, 400);
  assert.equal(calls.length, 0);
  const response = await send(JSON.stringify({ operation: "create-page", input: { page: "Research" } }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { data: { result: [1] } });
});

test("restart reuses an existing graph and never recreates a damaged graph", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "logseq-init-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const calls = [];
  const runner = {
    root,
    graph: "Proof",
    run: async (args) => {
      calls.push(args);
    }
  };
  await initializeGraph(runner);
  assert.deepEqual(calls, [
    ["graph", "create"],
    ["graph", "info"]
  ]);
  await mkdir(path.join(root, "graphs", "Proof"), { recursive: true });
  calls.length = 0;
  await initializeGraph(runner);
  assert.deepEqual(calls, [["graph", "info"]]);
  runner.run = async (args) => {
    calls.push(args);
    throw new Error("Damaged graph");
  };
  calls.length = 0;
  await assert.rejects(initializeGraph(runner), /Damaged graph/);
  assert.deepEqual(calls, [["graph", "info"]]);
});
