// Runs only in the disposable integration container alongside the fixture Manager.
import assert from "node:assert/strict";
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
await writeFile("/runtime/research-test-ids.json", JSON.stringify(ids));
console.log("Three native workflows installed disabled with n8n credential references.");
