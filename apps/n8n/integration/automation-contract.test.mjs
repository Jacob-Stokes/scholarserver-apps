import assert from "node:assert/strict";
import test from "node:test";
import { allowedActionsFor, projectReceipt } from "./automation-contract.mjs";

const template = { research: "reading-notes" };
const installed = { state: "installed", editing: "guided", researchAccess: "ready" };

test("automation contract projects state-dependent actions after inventory facts", () => {
  assert.deepEqual(allowedActionsFor(installed, template, { active: false }), ["enable", "runs", "revoke-research"]);
  assert.deepEqual(allowedActionsFor(installed, template, { active: true }), ["disable", "runs", "revoke-research"]);
  assert.deepEqual(allowedActionsFor({ ...installed, editing: "customised" }, template, { active: false }), [
    "runs",
    "revoke-research"
  ]);
  assert.deepEqual(allowedActionsFor({ ...installed, researchAccess: "disconnected" }, template, { active: false }), [
    "runs"
  ]);
  assert.deepEqual(allowedActionsFor({ state: "rejected", researchAccess: "ready" }, template, null), [
    "retry",
    "revoke-research"
  ]);
  assert.deepEqual(allowedActionsFor({ state: "unconfirmed" }, template, null), ["reconcile"]);
  assert.deepEqual(allowedActionsFor({ state: "installed", editing: "guided" }, undefined, { active: false }), [
    "runs"
  ]);
});

test("contract projection copies legacy receipt fields and adds allowed actions", () => {
  const receipt = { ...installed, templateId: "reading", operationId: "op-1", workflowId: "wf-1" };
  const projected = projectReceipt(receipt, template, { active: false });
  assert.equal(projected.operationId, "op-1");
  assert.deepEqual(projected.allowedActions, ["enable", "runs", "revoke-research"]);
  assert.notEqual(projected, receipt);
});
