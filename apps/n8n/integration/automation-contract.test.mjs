import assert from "node:assert/strict";
import test from "node:test";
import { allowedActionsFor, projectReceipt } from "./automation-contract.mjs";

const template = { version: 1, configuration: { scheduleNode: "schedule" }, research: "reading-notes" };
const installed = { state: "installed", templateVersion: 1, editing: "guided", researchAccess: "ready" };

test("automation contract projects state-dependent actions after inventory facts", () => {
  assert.deepEqual(allowedActionsFor(installed, template, { active: false }), [
    "view-schedule",
    "enable",
    "runs",
    "edit-schedule",
    "revoke-research"
  ]);
  assert.deepEqual(allowedActionsFor(installed, template, { active: true }), [
    "view-schedule",
    "disable",
    "runs",
    "revoke-research"
  ]);
  assert.deepEqual(allowedActionsFor({ ...installed, editing: "customised" }, template, { active: false }), [
    "view-schedule",
    "runs",
    "revoke-research"
  ]);
  assert.deepEqual(allowedActionsFor({ ...installed, researchAccess: "disconnected" }, template, { active: false }), [
    "view-schedule",
    "runs",
    "edit-schedule"
  ]);
  assert.deepEqual(
    allowedActionsFor({ ...installed, scheduleEdit: { state: "unconfirmed" } }, template, { active: false }),
    ["view-schedule", "runs", "revoke-research"]
  );
  assert.deepEqual(
    allowedActionsFor({ ...installed, scheduleEdit: { state: "updating" } }, template, { active: false }),
    ["view-schedule", "runs", "revoke-research"]
  );
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
  const receipt = {
    ...installed,
    templateId: "reading",
    operationId: "op-1",
    workflowId: "wf-1",
    scheduleEdit: { operationId: "schedule-op", state: "updated", requestedFingerprint: "private" }
  };
  const projected = projectReceipt(receipt, template, { active: false });
  assert.equal(projected.operationId, "op-1");
  assert.deepEqual(projected.scheduleChange, { operationId: "schedule-op", state: "updated" });
  assert.equal(projected.scheduleEdit, undefined);
  assert.deepEqual(projected.allowedActions, ["view-schedule", "enable", "runs", "edit-schedule", "revoke-research"]);
  assert.notEqual(projected, receipt);
});
