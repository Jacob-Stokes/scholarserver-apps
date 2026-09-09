// Runs inside the disposable integration container, never against user data.
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readdir, readFile, rm, stat } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { atomicJson } from "@scholarserver/controller-runtime/files";
import { BootstrapClient, setupScopes } from "./bootstrap-client.mjs";
import { defaultOwnerEmail } from "./password-setup.mjs";
import { N8nSetup } from "./setup.mjs";

const status = async () => (await fetch("http://localhost:8080/api/status")).json();
assert.equal((await status()).phase, "password-required");
const password = `Check9${randomBytes(24).toString("hex")}`;
const requestId = randomBytes(16).toString("hex");
const requestPath = `/runtime/requests/${requestId}.json`;
const responsePath = `/runtime/responses/${requestId}.json`;
await atomicJson(requestPath, { action: "setup", input: { password } });
let response;
for (let attempt = 0; attempt < 180; attempt++) {
  try {
    response = JSON.parse(await readFile(responsePath, "utf8"));
    break;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    await delay(250);
  }
}
assert.ok(response, "Password action must complete within its deadline");
if (!response.ok) {
  const diagnostics = new BootstrapClient("http://n8n:5678", async (url, options) => {
    const result = await fetch(url, options);
    if (!result.ok) {
      const failure = await result.clone().json();
      console.error("Disposable setup contract failure", url.pathname, result.status, failure.message);
    }
    return result;
  });
  if (await diagnostics.needsOwner()) await diagnostics.createOwner(defaultOwnerEmail, password);
  await diagnostics.signIn(defaultOwnerEmail, password);
  const attempt = JSON.parse(await readFile("/runtime/setup.json", "utf8"));
  await diagnostics.findSetupKey(attempt.label);
  await diagnostics.createKey(attempt.label);
}
assert.equal(response.ok, true, response.error);
assert.deepEqual(await status(), { connected: true, phase: "ready" });
await assert.rejects(readFile(requestPath), { code: "ENOENT" });
await rm(responsePath);
for (const file of ["setup.json", "connection.json"]) {
  const saved = await readFile(`/runtime/${file}`, "utf8");
  assert.equal(saved.includes(password), false);
  assert.equal((await stat(`/runtime/${file}`)).mode & 0o777, 0o600);
}
const bootstrap = new BootstrapClient("http://n8n:5678");
await bootstrap.signIn(defaultOwnerEmail, password);
const journal = JSON.parse(await readFile("/runtime/setup.json", "utf8"));
const issued = await bootstrap.findSetupKey(journal.label);
assert.deepEqual([...issued.scopes].sort(), [...setupScopes].sort());
assert.equal(issued.expiresAt, null);
await assert.rejects(bootstrap.createOwner("replacement@example.invalid", `Other9${randomBytes(16).toString("hex")}`));
await bootstrap.signIn(defaultOwnerEmail, password);
bootstrap.cookie = "";
const setup = new N8nSetup({ directory: "/runtime", baseUrl: "http://n8n:5678" });
const client = await setup.client();
const credential = await client.createCredential({
  name: "Disposable acceptance credential",
  type: "httpHeaderAuth",
  data: { name: "X-Test", value: "synthetic-only" }
});
assert.equal(typeof credential.id, "string");
assert.deepEqual(await readdir("/runtime/requests"), []);
console.log(
  "Password-only action passed: owner sign-in, restricted key, no owner overwrite, credential creation and secret-file cleanup."
);
