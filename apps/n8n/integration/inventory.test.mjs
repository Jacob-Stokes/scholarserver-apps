import assert from "node:assert/strict";
import test from "node:test";
import { completeWorkflowInventory, editingState } from "./inventory.mjs";
import { workflowFingerprint } from "./templates.mjs";

test("inventory includes later pages rather than marking their workflows missing", async () => {
  const client = {
    listWorkflows: async (cursor) =>
      cursor ? { data: [{ id: "second" }] } : { data: [{ id: "first" }], nextCursor: "page-two" }
  };
  assert.deepEqual(
    (await completeWorkflowInventory(client)).map((workflow) => workflow.id),
    ["first", "second"]
  );
});

test("repeated cursors and duplicate IDs fail instead of returning a partial inventory", async () => {
  await assert.rejects(
    completeWorkflowInventory({
      listWorkflows: async () => ({ data: [], nextCursor: "loop" })
    }),
    /incomplete/
  );
  await assert.rejects(
    completeWorkflowInventory({
      listWorkflows: async () => ({ data: [{ id: "duplicate" }, { id: "duplicate" }] })
    }),
    /changed/
  );
});

test("native edits are visible without changing a guided fingerprint or workflow", () => {
  const workflow = { name: "Reading", nodes: [], connections: {}, settings: {} };
  const receipt = { fingerprint: workflowFingerprint(workflow) };
  assert.equal(editingState(workflow, receipt), "guided");
  assert.equal(editingState({ ...workflow, name: "My edited workflow" }, receipt), "customised");
  assert.equal(editingState(null, receipt), "unavailable");
  assert.equal(editingState(workflow, {}), "unknown");
  assert.equal(receipt.fingerprint, workflowFingerprint(workflow));
});
