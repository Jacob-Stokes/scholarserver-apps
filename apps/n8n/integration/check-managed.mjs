// Run inside the disposable integration container after browser acceptance.
import assert from "node:assert/strict";
import { N8nSetup } from "./setup.mjs";

const setup = new N8nSetup({ directory: "/runtime", baseUrl: "http://n8n:5678" });
const client = await setup.client();
const inventory = await (await fetch("http://localhost:8080/api/automations")).json();
const receipt = inventory.installations["connection-check"];
assert.equal(receipt.state, "installed");
const original = await client.getWorkflow(receipt.workflowId);
assert.equal(original.active, false);

async function enabled(value) {
  return fetch("http://localhost:8080/api/enabled", {
    method: "POST",
    headers: { "content-type": "application/json", "x-requested-with": "ScholarServer" },
    body: JSON.stringify({ templateId: "connection-check", enabled: value })
  });
}

assert.equal((await enabled("true")).status, 400);
assert.equal((await enabled(true)).status, 200);
const published = await client.getWorkflow(receipt.workflowId);
assert.equal(published.activeVersionId, original.versionId);
assert.equal((await enabled(false)).status, 200);

// Simulate a direct editor change to this disposable workflow only.
await client.updateWorkflow(receipt.workflowId, {
  name: `${original.name} edited directly`,
  nodes: original.nodes,
  connections: original.connections,
  settings: original.settings
});
const conflict = await enabled(true);
assert.equal(conflict.status, 409);
assert.match((await conflict.json()).error, /changed in n8n/);
assert.equal((await client.getWorkflow(receipt.workflowId)).active, false);
console.log("Verified-version publication, input validation and direct-edit protection passed.");
