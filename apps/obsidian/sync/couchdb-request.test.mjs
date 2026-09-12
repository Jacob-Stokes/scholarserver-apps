import assert from "node:assert/strict";
import test from "node:test";
import { couchRequest } from "./couchdb-request.mjs";

function mockRequests(t, statuses) {
  let requests = 0;
  t.mock.method(globalThis, "setTimeout", (callback) => queueMicrotask(callback));
  t.mock.method(globalThis, "fetch", async () => {
    const status = statuses[Math.min(requests, statuses.length - 1)];
    requests += 1;
    return new Response("synthetic", { status });
  });
  return () => requests;
}

test("initial readiness waits through CouchDB admin bootstrap without dropping authentication", async (t) => {
  const count = mockRequests(t, [401, 401, 200]);
  const init = { method: "GET", headers: { Authorization: "Basic synthetic-test-only" } };
  assert.equal(
    await couchRequest("CouchDB startup", "http://couchdb/_up", init, undefined, { startupReadiness: true }),
    "synthetic"
  );
  assert.equal(count(), 3);
  for (const call of fetch.mock.calls)
    assert.equal(call.arguments[1].headers.Authorization, init.headers.Authorization);
});

test("permanent startup authentication failure remains bounded and reports the final 401", async (t) => {
  const count = mockRequests(t, [401]);
  await assert.rejects(
    couchRequest("CouchDB startup", "http://couchdb/_up", { method: "GET" }, undefined, { startupReadiness: true }),
    /CouchDB startup failed \(HTTP 401\)/
  );
  assert.equal(count(), 24);
});

test("ordinary authentication failures and startup 403s are not retried", async (t) => {
  const count = mockRequests(t, [401, 403]);
  await assert.rejects(couchRequest("CouchDB configuration", "http://couchdb/_config", { method: "PUT" }), /HTTP 401/);
  assert.equal(count(), 1);
  await assert.rejects(
    couchRequest("CouchDB startup", "http://couchdb/_up", { method: "GET" }, undefined, { startupReadiness: true }),
    /HTTP 403/
  );
  assert.equal(count(), 2);
});

test("startup authentication retry cannot be applied to mutation routes", async (t) => {
  const count = mockRequests(t, [200]);
  await assert.rejects(
    couchRequest("configuration", "http://couchdb/_config", { method: "PUT" }, undefined, { startupReadiness: true }),
    /limited to the CouchDB readiness probe/
  );
  assert.equal(count(), 0);
});

test("server failures still retry and explicitly accepted setup conflicts still succeed", async (t) => {
  const count = mockRequests(t, [503, 200, 409]);
  await couchRequest("CouchDB startup", "http://couchdb/_up", { method: "GET" });
  assert.equal(count(), 2);
  await couchRequest(
    "single-node setup",
    "http://couchdb/_cluster_setup",
    { method: "POST" },
    (response) => response.status === 409
  );
  assert.equal(count(), 3);
});
