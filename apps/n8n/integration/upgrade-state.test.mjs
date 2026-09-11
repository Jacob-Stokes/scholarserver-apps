import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { checkUpgradeState } from "./check-upgrade-state.mjs";

test("upgrade acceptance preserves only IDs and checks the original workflow", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "n8n-upgrade-state-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const client = {
    async createCredential(credential) {
      assert.equal(credential.type, "httpHeaderAuth");
      return { id: "credential-id" };
    },
    async createWorkflow(workflow) {
      assert.equal(workflow.nodes[0].type, "n8n-nodes-base.manualTrigger");
      return { id: "workflow-id" };
    },
    async getWorkflow(id) {
      assert.equal(id, "workflow-id");
      return { name: "Preserved upgrade workflow", active: false };
    }
  };
  const seeded = await checkUpgradeState("seed", client, directory);
  const verified = await checkUpgradeState("verify", client, directory);
  assert.deepEqual(verified, seeded);
  const receiptPath = path.join(directory, "upgrade-test.json");
  const receipt = JSON.parse(await readFile(receiptPath, "utf8"));
  assert.deepEqual(receipt, { workflowId: "workflow-id", credentialId: "credential-id" });
  assert.equal((await stat(receiptPath)).mode & 0o777, 0o600);
  client.getWorkflow = async () => ({ name: "Changed workflow", active: false });
  await assert.rejects(checkUpgradeState("verify", client, directory));
  await assert.rejects(checkUpgradeState("unknown", client, directory), /Unknown upgrade acceptance phase/);
});
