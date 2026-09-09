import assert from "node:assert/strict";
import test from "node:test";
import { N8nClient } from "./client.mjs";

function client(fetchImplementation) {
  return new N8nClient({ baseUrl: "http://n8n:5678", apiKey: "private-test-key", fetchImplementation });
}

test("credentials go to the public API and only references are returned", async () => {
  const api = client(async (url, options) => {
    assert.equal(url, "http://n8n:5678/api/v1/credentials");
    assert.equal(options.redirect, "error");
    assert.equal(options.headers["X-N8N-API-KEY"], "private-test-key");
    assert.equal(JSON.parse(options.body).data.apiKey, "workflow-secret");
    return Response.json({ id: "credential-1", data: { apiKey: "must-not-escape" } });
  });
  assert.deepEqual(
    await api.createCredential({ name: "Research", type: "example", data: { apiKey: "workflow-secret" } }),
    { id: "credential-1", name: "Research", type: "example" }
  );
});

test("lost mutation responses are unconfirmed and are never retried", async () => {
  let attempts = 0;
  const api = client(async () => {
    attempts++;
    throw new Error("secret from transport");
  });
  await assert.rejects(api.createWorkflow({ name: "Example" }), (error) => {
    assert.equal(error.outcome, "unconfirmed");
    assert.doesNotMatch(error.message, /secret/);
    return true;
  });
  assert.equal(attempts, 1);
});

test("HTTP failures redact upstream bodies and distinguish rejection from uncertainty", async () => {
  for (const [status, outcome] of [
    [401, "rejected"],
    [403, "rejected"],
    [500, "unconfirmed"]
  ]) {
    const api = client(async () => new Response("sensitive submitted value", { status }));
    await assert.rejects(api.setEnabled("workflow", true), (error) => {
      assert.equal(error.status, status);
      assert.equal(error.outcome, outcome);
      assert.doesNotMatch(error.message, /sensitive/);
      return true;
    });
  }
});

test("unreadable successful writes remain unconfirmed", async () => {
  const api = client(async () => new Response("not JSON"));
  await assert.rejects(api.createWorkflow({}), { outcome: "unconfirmed" });
});

test("execution listing excludes execution payloads", async () => {
  const api = client(async (url) => {
    const query = new URL(url).searchParams;
    assert.equal(query.get("includeData"), "false");
    assert.equal(query.get("workflowId"), "workflow-1");
    return Response.json({ data: [] });
  });
  await api.listExecutions("workflow-1");
});

test("oversized responses are bounded and do not confirm a write", async () => {
  const api = client(async () => new Response("x".repeat(2 * 1024 * 1024 + 1)));
  await assert.rejects(api.createWorkflow({}), { outcome: "unconfirmed" });
});
