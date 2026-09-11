// Disposable acceptance only. The outer harness supplies this file on stdin.
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { N8nSetup } from "./setup.mjs";

export async function checkUpgradeState(phase, client, directory) {
  const receiptPath = path.join(directory, "upgrade-test.json");
  if (phase === "seed") {
    const credential = await client.createCredential({
      name: "Upgrade test credential",
      type: "httpHeaderAuth",
      data: { name: "X-Upgrade-Test", value: "synthetic-upgrade-only" }
    });
    const workflow = await client.createWorkflow({
      name: "Preserved upgrade workflow",
      settings: {},
      nodes: [
        {
          id: "manual",
          name: "Manual",
          type: "n8n-nodes-base.manualTrigger",
          typeVersion: 1,
          position: [0, 0]
        }
      ],
      connections: {}
    });
    const receipt = { workflowId: workflow.id, credentialId: credential.id };
    await writeFile(receiptPath, JSON.stringify(receipt), { mode: 0o600 });
    return receipt;
  }
  assert.equal(phase, "verify", "Unknown upgrade acceptance phase");
  const receipt = JSON.parse(await readFile(receiptPath, "utf8"));
  const workflow = await client.getWorkflow(receipt.workflowId);
  assert.equal(workflow.name, "Preserved upgrade workflow");
  assert.equal(workflow.active, false);
  return receipt;
}

if (process.argv[1] === "-") {
  const setup = new N8nSetup({ directory: "/runtime", baseUrl: "http://n8n:5678" });
  const client = await setup.client();
  const receipt = await checkUpgradeState(process.argv[2], client, "/runtime");
  console.log(JSON.stringify(receipt));
}
