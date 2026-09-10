// Runs only in the disposable integration container alongside the fixture Manager.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { N8nSetup } from "./setup.mjs";

const setup = new N8nSetup({ directory: "/runtime", baseUrl: "http://n8n:5678" });
const client = await setup.client();
const templates = (await (await fetch("http://localhost:8080/api/automations")).json()).templates.filter(
  (template) => template.research
);
const ids = [];
for (const template of templates) {
  const destination = template.research === "convert-pdfs" ? "docling" : "obsidian";
  const response = await fetch("http://localhost:8080/api/install", {
    method: "POST",
    headers: { "content-type": "application/json", "x-requested-with": "ScholarServer" },
    body: JSON.stringify({
      templateId: template.id,
      settings: {
        research: {
          workspaceId: "personal",
          zotero: "zotero",
          [destination]: destination,
          folder: destination === "docling" ? "Papers" : "Research"
        }
      }
    })
  });
  const receipt = await response.json();
  assert.equal(receipt.state, "installed", JSON.stringify(receipt));
  const workflow = await client.getWorkflow(receipt.workflowId);
  assert.equal(workflow.active, false);
  for (const node of workflow.nodes) {
    if (node.type === "n8n-nodes-base.httpRequest") {
      assert.equal(typeof node.credentials.httpHeaderAuth.id, "string");
      assert.equal(JSON.stringify(node.parameters).includes("X-ScholarServer-Workflow"), false);
    }
    // Test-only accelerated wait. The packaged workflow keeps its one-minute wait.
    if (node.type === "n8n-nodes-base.wait")
      node.parameters = { resume: "timeInterval", amount: 0.01, unit: "seconds" };
  }
  await client.updateWorkflow(workflow.id, {
    name: workflow.name,
    nodes: workflow.nodes,
    connections: workflow.connections,
    settings: workflow.settings
  });
  ids.push(workflow.id);
}
// A second configured copy has its own credential and receipt. Reusing the
// request identity must return the same copy, never create a third one.
const duplicateId = randomUUID();
const input = {
  templateId: "zotero-reading-notes",
  automationId: duplicateId,
  name: "Second reading copy",
  settings: {
    hoursInterval: 12,
    research: {
      workspaceId: "personal",
      zotero: "zotero",
      obsidian: "obsidian",
      folder: "Research"
    }
  }
};
async function installCopy() {
  const response = await fetch("http://localhost:8080/api/install", {
    method: "POST",
    headers: { "content-type": "application/json", "x-requested-with": "ScholarServer" },
    body: JSON.stringify(input)
  });
  assert.equal(response.status, 200);
  return response.json();
}
const firstCopy = await installCopy();
const repeatedCopy = await installCopy();
assert.equal(firstCopy.state, "installed");
assert.equal(firstCopy.workflowId, repeatedCopy.workflowId);
assert.ok(!ids.includes(firstCopy.workflowId));
ids.push(firstCopy.workflowId);
const inventory = await (await fetch("http://localhost:8080/api/automations")).json();
assert.equal(inventory.installations[duplicateId].editing, "guided");
assert.equal(inventory.installations[duplicateId].bindings.folder, "Research");
assert.equal(inventory.workflows.find((workflow) => workflow.id === firstCopy.workflowId).active, false);
async function setEnabled(enabled) {
  return fetch("http://localhost:8080/api/enabled", {
    method: "POST",
    headers: { "content-type": "application/json", "x-requested-with": "ScholarServer" },
    body: JSON.stringify({ automationId: duplicateId, enabled })
  });
}
assert.equal((await setEnabled(true)).status, 200);
assert.equal((await setEnabled(false)).status, 200);
const editable = await client.getWorkflow(firstCopy.workflowId);
await client.updateWorkflow(editable.id, {
  name: "Customised native reading workflow",
  nodes: editable.nodes,
  connections: editable.connections,
  settings: editable.settings
});
assert.equal((await setEnabled(true)).status, 409);
assert.equal((await client.getWorkflow(firstCopy.workflowId)).active, false);
const customised = await (await fetch("http://localhost:8080/api/automations")).json();
assert.equal(customised.installations[duplicateId].editing, "customised");
await writeFile("/runtime/research-test-ids.json", JSON.stringify(ids));
console.log(
  "Three templates and a second reading copy: independent identity, enable/disable, native edit detection and no overwrite passed."
);
