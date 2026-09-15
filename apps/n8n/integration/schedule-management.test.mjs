import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { configureWorkflow } from "./configuration.mjs";
import { ScheduleManagement } from "./schedule-management.mjs";
import { readTemplate, workflowFingerprint, workflowFromTemplate } from "./templates.mjs";
import { WorkflowInstallations } from "./workflows.mjs";

const hourly = readTemplate(await readFile(new URL("../templates/connection-check.yaml", import.meta.url), "utf8"));
const minutes = readTemplate(await readFile(new URL("../templates/zotero-pdf-markdown.yaml", import.meta.url), "utf8"));

async function fixture(t, template = hourly) {
  const directory = await mkdtemp(path.join(tmpdir(), "n8n-schedule-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const automationId = randomUUID();
  let workflow = {
    ...configureWorkflow(template, workflowFromTemplate(template)),
    id: "workflow-1",
    versionId: "version-1",
    active: false,
    description: "Keep this description",
    nodeGroups: [{ id: "group-1", name: "Existing group", nodeIds: [] }],
    staticData: { lastRun: "preserve" },
    pinData: { Example: [{ json: { value: "preserve" } }] }
  };
  workflow.nodes.at(-1).credentials = { testCredential: { id: "credential-1", name: "Existing access" } };
  let updates = 0;
  let reads = 0;
  let readBehavior = async () => structuredClone(workflow);
  let updateBehavior = async (candidate) => {
    workflow = { ...candidate, id: workflow.id, active: workflow.active, versionId: `version-${updates + 1}` };
    return workflow;
  };
  const client = {
    getWorkflow: async () => {
      reads++;
      return readBehavior();
    },
    updateWorkflow: async (_id, candidate) => {
      updates++;
      return updateBehavior(candidate);
    }
  };
  const installations = new WorkflowInstallations({
    statePath: path.join(directory, "installations.json"),
    client,
    templates: [template]
  });
  await installations.save({
    schemaVersion: 1,
    installations: {
      [automationId]: {
        automationId,
        templateId: template.id,
        templateVersion: template.version,
        state: "installed",
        workflowId: workflow.id,
        fingerprint: workflowFingerprint(workflow)
      }
    }
  });
  const service = new ScheduleManagement({ installations, templates: [template], requiredClient: async () => client });
  return {
    automationId,
    installations,
    service,
    get workflow() {
      return workflow;
    },
    set workflow(value) {
      workflow = value;
    },
    get updates() {
      return updates;
    },
    get reads() {
      return reads;
    },
    set readBehavior(value) {
      readBehavior = value;
    },
    set updateBehavior(value) {
      updateBehavior = value;
    }
  };
}

test("reads and safely edits saved hourly and minute schedules", async (t) => {
  for (const [template, unit, value] of [
    [hourly, "hours", 12],
    [minutes, "minutes", 15]
  ]) {
    await t.test(unit, async (child) => {
      const valueFixture = await fixture(child, template);
      const before = await valueFixture.service.read(valueFixture.automationId);
      assert.equal(before.unit, unit);
      assert.equal(before.savedValue, 1);
      assert.equal(before.canEdit, true);
      assert.equal(before.editState, "none");
      assert.equal(before.label, "Run every");
      assert.equal(typeof before.version, "string");
      const originalConnections = structuredClone(valueFixture.workflow.connections);
      const originalCredentials = structuredClone(valueFixture.workflow.nodes.at(-1).credentials);
      const originalSettings = structuredClone(valueFixture.workflow.settings);
      const originalDescription = valueFixture.workflow.description;
      const originalNodeGroups = structuredClone(valueFixture.workflow.nodeGroups);
      const originalStaticData = structuredClone(valueFixture.workflow.staticData);
      const originalPinData = structuredClone(valueFixture.workflow.pinData);
      const receipt = await valueFixture.service.edit(valueFixture.automationId, value, before.version);
      assert.equal(receipt.state, "updated");
      assert.deepEqual(receipt.allowedActions, ["edit-schedule"]);
      assert.equal((await valueFixture.service.read(valueFixture.automationId)).savedValue, value);
      assert.deepEqual(valueFixture.workflow.connections, originalConnections);
      assert.deepEqual(valueFixture.workflow.nodes.at(-1).credentials, originalCredentials);
      assert.deepEqual(valueFixture.workflow.settings, originalSettings);
      assert.equal(valueFixture.workflow.description, originalDescription);
      assert.deepEqual(valueFixture.workflow.nodeGroups, originalNodeGroups);
      assert.deepEqual(valueFixture.workflow.staticData, originalStaticData);
      assert.deepEqual(valueFixture.workflow.pinData, originalPinData);
      assert.equal(valueFixture.workflow.active, false);
    });
  }
});

test("rejects active, customised, stale-version and out-of-range edits before writing", async (t) => {
  const active = await fixture(t);
  active.workflow = { ...active.workflow, active: true };
  await assert.rejects(active.service.edit(active.automationId, 2, "version-1"), /Turn off automatic runs/);
  assert.equal(active.updates, 0);

  const customised = await fixture(t);
  customised.workflow = { ...customised.workflow, name: "Edited in n8n" };
  await assert.rejects(customised.service.edit(customised.automationId, 2, "version-1"), /changed in n8n/);
  assert.equal(customised.updates, 0);

  const stale = await fixture(t);
  await assert.rejects(stale.service.edit(stale.automationId, 2, "older-version"), /Refresh before/);
  await assert.rejects(stale.service.edit(stale.automationId, 169, "version-1"), /1 to 168/);
  assert.equal(stale.updates, 0);
});

test("serialises concurrent edits and rejects the stale second version", async (t) => {
  const valueFixture = await fixture(t);
  const results = await Promise.allSettled([
    valueFixture.service.edit(valueFixture.automationId, 2, "version-1"),
    valueFixture.service.edit(valueFixture.automationId, 3, "version-1")
  ]);
  assert.equal(results[0].status, "fulfilled");
  assert.equal(results[1].status, "rejected");
  assert.equal(valueFixture.updates, 1);
});

test("rechecks the paused version and fingerprint immediately before PUT", async (t) => {
  const valueFixture = await fixture(t);
  let reads = 0;
  valueFixture.readBehavior = async () => {
    reads++;
    if (reads === 1) return structuredClone(valueFixture.workflow);
    return { ...structuredClone(valueFixture.workflow), name: "External edit" };
  };
  await assert.rejects(
    valueFixture.service.edit(valueFixture.automationId, 2, "version-1"),
    /changed before the schedule could be saved/
  );
  assert.equal(valueFixture.updates, 0);
  assert.equal(
    (await valueFixture.installations.read()).installations[valueFixture.automationId].scheduleEdit,
    undefined
  );
});

test("an uncertain update is journalled and reconciled without replay", async (t) => {
  const valueFixture = await fixture(t);
  let submitted;
  valueFixture.updateBehavior = async (candidate) => {
    submitted = candidate;
    throw Object.assign(new Error("response lost"), { outcome: "unconfirmed" });
  };
  const uncertain = await valueFixture.service.edit(valueFixture.automationId, 4, "version-1");
  assert.equal(uncertain.state, "unconfirmed");
  assert.equal(valueFixture.updates, 1);
  const repeated = await valueFixture.service.edit(valueFixture.automationId, 4, "version-1");
  assert.equal(repeated.state, "unconfirmed");
  assert.equal(valueFixture.updates, 1);
  await assert.rejects(
    valueFixture.service.edit(valueFixture.automationId, 5, "version-1"),
    /different schedule change/
  );
  const pending = await valueFixture.service.read(valueFixture.automationId);
  assert.equal(pending.editState, "unconfirmed");
  assert.equal(pending.editExpectedVersion, "version-1");
  assert.equal(pending.canEdit, false);

  valueFixture.workflow = { ...submitted, id: "workflow-1", active: false, versionId: "version-2" };
  const reconciled = await valueFixture.service.read(valueFixture.automationId);
  assert.equal(reconciled.editState, "updated");
  assert.equal(reconciled.savedValue, 4);
  assert.equal(reconciled.version, "version-2");
  assert.equal(reconciled.canEdit, true);
});

test("GET converts a restart-left updating receipt to read-only reconciliation", async (t) => {
  const valueFixture = await fixture(t);
  const state = await valueFixture.installations.read();
  const receipt = state.installations[valueFixture.automationId];
  const candidate = configureWorkflow(hourly, structuredClone(valueFixture.workflow), { hoursInterval: 7 });
  receipt.scheduleEdit = {
    operationId: randomUUID(),
    state: "updating",
    expectedVersion: "version-1",
    requestedValue: 7,
    previousFingerprint: receipt.fingerprint,
    requestedFingerprint: workflowFingerprint(candidate)
  };
  await valueFixture.installations.save(state);
  const schedule = await valueFixture.service.read(valueFixture.automationId);
  assert.equal(schedule.editState, "unconfirmed");
  assert.equal(schedule.savedValue, 1);
  assert.equal(schedule.canEdit, false);
  assert.equal(valueFixture.updates, 0);
});

test("a definitive upstream rejection records no-write outcome and permits a fresh request", async (t) => {
  const valueFixture = await fixture(t);
  valueFixture.updateBehavior = async () => {
    throw Object.assign(new Error("rejected"), { outcome: "rejected" });
  };
  const rejected = await valueFixture.service.edit(valueFixture.automationId, 5, "version-1");
  assert.equal(rejected.state, "rejected");
  assert.equal((await valueFixture.service.read(valueFixture.automationId)).canEdit, true);
});

test("schedule writes and enable changes share the installation lock", async () => {
  const server = await readFile(new URL("./server.mjs", import.meta.url), "utf8");
  assert.match(server, /url\.pathname === "\/api\/enabled"[\s\S]*installations\.serialise/);
  assert.match(server, /input\.enabled && schedulePending/);
  assert.match(server, /url\.pathname === "\/api\/schedule"[\s\S]*scheduleManagement\.edit/);
  assert.match(server, /scheduleWrite[\s\S]*code: "schedule_invalid"/);
});
