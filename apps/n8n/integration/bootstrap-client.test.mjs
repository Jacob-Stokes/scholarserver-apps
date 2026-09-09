import assert from "node:assert/strict";
import test from "node:test";
import { BootstrapClient, setupScopes } from "./bootstrap-client.mjs";

test("bootstrap uses the pinned account contract and carries only its own short-lived session", async () => {
  const calls = [];
  const client = new BootstrapClient("http://n8n:5678", async (url, options) => {
    calls.push({ url, options });
    let data = { role: "global:owner" };
    if (url.pathname === "/rest/settings") data = { userManagement: { showSetupOnFirstLoad: true } };
    if (url.pathname === "/rest/api-keys" && options.method === "GET") data = { items: [], counts: { mine: 0 } };
    return new Response(JSON.stringify({ data }), { headers: { "set-cookie": "n8n-auth=test-session; HttpOnly" } });
  });
  assert.equal(await client.needsOwner(), true);
  await client.createOwner("owner@example.invalid", "Temporary9");
  await client.signIn("owner@example.invalid", "Temporary9", "123456");
  assert.equal(await client.findSetupKey("Owned label"), null);
  await client.createKey("Owned label");
  await client.rotateKey("id/escaped");
  assert.equal(calls[0].options.headers.cookie, "");
  assert.equal(calls[2].options.headers.cookie, "n8n-auth=test-session");
  assert.deepEqual(JSON.parse(calls[4].options.body), { label: "Owned label", expiresAt: null, scopes: setupScopes });
  assert.equal(calls[5].url.pathname, "/rest/api-keys/id%2Fescaped/rotate");
  assert.ok(calls.every((call) => call.options.redirect === "error" && call.url.origin === "http://n8n:5678"));
});

test("upstream failures never disclose the response or submitted password", async () => {
  for (const status of [400, 401, 403, 500]) {
    const client = new BootstrapClient(
      "http://n8n:5678",
      async () => new Response("private-response-secret", { status })
    );
    await assert.rejects(client.signIn("owner@example.invalid", "PasswordSecret9"), (error) => {
      assert.doesNotMatch(error.message, /private-response-secret|PasswordSecret9/);
      return true;
    });
  }
});

test("incompatible settings, oversized responses and ambiguous keys fail closed", async () => {
  const incompatible = new BootstrapClient("http://n8n:5678", async () => Response.json({ data: {} }));
  await assert.rejects(incompatible.needsOwner(), /compatibility/);
  const oversized = new BootstrapClient("http://n8n:5678", async () => new Response("x".repeat(2 * 1024 * 1024 + 1)));
  await assert.rejects(oversized.needsOwner(), /incomplete/);
  const ambiguous = new BootstrapClient("http://n8n:5678", async () =>
    Response.json({ data: { items: [{ label: "same" }, { label: "same" }] } })
  );
  await assert.rejects(ambiguous.findSetupKey("same"), /More than one/);
});
