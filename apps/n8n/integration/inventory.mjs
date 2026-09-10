import { workflowFingerprint } from "./templates.mjs";

// A partial listing cannot establish that an installed workflow is missing.
// Bound traversal and reject repeated cursors instead of silently omitting data.
export async function completeWorkflowInventory(client) {
  const workflows = [];
  const ids = new Set();
  const cursors = new Set();
  let cursor;
  for (let page = 0; page < 100; page++) {
    const result = await client.listWorkflows(cursor);
    if (!Array.isArray(result?.data)) throw new Error("Could not read workflow inventory");
    for (const workflow of result.data) {
      if (typeof workflow.id !== "string" || ids.has(workflow.id))
        throw new Error("Workflow inventory changed; refresh status");
      ids.add(workflow.id);
      workflows.push(workflow);
    }
    cursor = result.nextCursor;
    if (!cursor) return workflows;
    if (cursors.has(cursor)) throw new Error("Workflow inventory is incomplete");
    cursors.add(cursor);
  }
  throw new Error("Workflow inventory exceeds the supported limit");
}

export function editingState(workflow, receipt) {
  if (!workflow) return "unavailable";
  if (!receipt.fingerprint) return "unknown";
  if (workflowFingerprint(workflow) !== receipt.fingerprint) return "customised";
  return "guided";
}
