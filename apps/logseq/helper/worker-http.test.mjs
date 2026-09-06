import assert from "node:assert/strict";
import test from "node:test";
import transit from "transit-js";
import { HttpOperations } from "./http-operations.mjs";
import { jsonValue, keyword, map, WorkerHttp } from "./worker-http.mjs";

const endpoint = {
  "base-url": "http://127.0.0.1:12345",
  repo: "logseq_db_Proof",
  revision: "b09316a",
  "root-dir": "/graph",
  pid: 10
};
const options = { endpoint, graph: "Proof", root: "/graph" };

test("Transit retains namespaces, Unicode, literal Transit-looking text and safe map keys", () => {
  const input = map({
    "db/id": 23,
    "block/title": "~:literal αβγ [[Paper]]",
    children: transit.list([map({ "db/id": 24 })])
  });
  assert.deepEqual(jsonValue(transit.reader("json").read(transit.writer("json").write(input))), {
    "db/id": 23,
    "block/title": "~:literal αβγ [[Paper]]",
    children: [{ "db/id": 24 }]
  });
  const result = jsonValue(transit.map([keyword("__proto__"), "safe"]));
  assert.equal(Object.getPrototypeOf(result), Object.prototype);
  assert.equal(Object.hasOwn(result, "__proto__"), true);
});

test("worker discovery rejects foreign addresses, graphs and versions", () => {
  for (const patch of [
    { "base-url": "https://example.com" },
    { "base-url": "http://localhost:1234" },
    { "base-url": "http://127.0.0.1:1234/?secret=x" },
    { repo: "logseq_db_Other" },
    { revision: "new-version" },
    { "root-dir": "/other" }
  ]) {
    assert.throws(
      () => new WorkerHttp({ ...options, endpoint: { ...endpoint, ...patch } }),
      /unexpected|does not match/
    );
  }
});

test("worker identity is checked before dispatch and redirects are prohibited", async () => {
  let calls = 0;
  const worker = new WorkerHttp({
    ...options,
    fetchImpl: async (_url, request) => {
      calls++;
      assert.equal(request.redirect, "error");
      return Response.json({ ...endpoint, status: "ready", pid: 11 });
    }
  });
  const operations = new HttpOperations({ worker, graph: "Proof" });
  await assert.rejects(operations.execute("create-page", { page: "Must not be created" }), { code: "worker-changed" });
  assert.equal(calls, 1);
});

test("oversized and rejected responses do not expose upstream diagnostics", async () => {
  let worker = new WorkerHttp({ ...options, fetchImpl: async () => new Response("x".repeat(2_000_001)) });
  await assert.rejects(worker.check(), { code: "result-too-large" });
  worker = new WorkerHttp({
    ...options,
    fetchImpl: async () => Response.json({ ok: false, error: { message: "private note secret" } })
  });
  await assert.rejects(worker.invoke("pull", []), (error) => !error.message.includes("private note"));
});

test("lost write responses are never retried and later operations can proceed", async () => {
  let writes = 0;
  const worker = {
    check: async () => {},
    invoke: async (method) => {
      if (method === "pull") return null;
      writes++;
      throw new Error("network lost: private text");
    }
  };
  const operations = new HttpOperations({ worker, graph: "Proof" });
  await assert.rejects(operations.execute("create-page", { page: "Test" }), { code: "outcome-unknown" });
  assert.equal(writes, 1);
  worker.invoke = async () => [];
  assert.deepEqual(await operations.execute("list-pages"), { items: [] });
});

test("input validation precedes any worker call and admission is bounded", async () => {
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const operations = new HttpOperations({ worker: { check: () => gate, invoke: async () => [] }, graph: "Proof" });
  assert.throws(() => operations.execute("query", { query: "arbitrary" }), { code: "unknown-operation" });
  assert.throws(() => operations.execute("read-block", { id: -1 }), { code: "invalid-input" });
  const requests = Array.from({ length: 16 }, () => operations.execute("list-pages"));
  await assert.rejects(operations.execute("list-pages"), { code: "busy" });
  release();
  await Promise.all(requests);
});

test("an expired queued operation is not dispatched", async () => {
  let calls = 0;
  const operations = new HttpOperations({
    timeoutMs: 5,
    graph: "Proof",
    worker: {
      check: async () => {
        await new Promise((resolve) => setTimeout(resolve, 15));
      },
      invoke: async () => {
        calls++;
        return [];
      }
    }
  });
  const first = assert.rejects(operations.execute("list-pages"), { code: "unavailable" });
  const second = operations.execute("list-pages");
  await assert.rejects(second, { code: "busy" });
  await first;
  assert.equal(calls, 0);
});
