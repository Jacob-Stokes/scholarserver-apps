import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { readTemplate } from "./templates.mjs";
import { WorkflowInstallations } from "./workflows.mjs";

const template = readTemplate(await readFile(new URL("../templates/connection-check.yaml", import.meta.url), "utf8"));
async function fixture(t, client) {
  const directory = await mkdtemp(path.join(tmpdir(), "n8n-bindings-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const options = { statePath: path.join(directory, "bindings.json"), client, templates: [template] };
  return { options, service: new WorkflowInstallations(options) };
}

test("concurrent template installs send one create and survive controller restart", async (t) => {
  let creates = 0;
  const { service, options } = await fixture(t, {
    createWorkflow: async (workflow) => {
      creates++;
      return { ...workflow, id: "workflow-1" };
    }
  });
  const [first, second] = await Promise.all([service.install(template.id), service.install(template.id)]);
  assert.equal(first.workflowId, "workflow-1");
  assert.deepEqual(first, second);
  assert.deepEqual(await new WorkflowInstallations(options).install(template.id), first);
  assert.equal(creates, 1);
});

test("lost create response is reconciled without repeating the mutation", async (t) => {
  let created;
  let creates = 0;
  const { service, options } = await fixture(t, {
    createWorkflow: async (workflow) => {
      creates++;
      created = { ...workflow, id: "workflow-1" };
      throw new Error("lost response");
    },
    listWorkflows: async () => ({ data: [created] }),
    getWorkflow: async () => created
  });
  assert.equal((await service.install(template.id)).state, "unconfirmed");
  const restarted = new WorkflowInstallations(options);
  assert.equal((await restarted.install(template.id)).state, "unconfirmed");
  assert.equal((await restarted.reconcile(template.id)).state, "installed");
  assert.equal(creates, 1);
});

test("missing upstream workflow remains unconfirmed, not permission to create again", async (t) => {
  const { service } = await fixture(t, {
    createWorkflow: async () => {
      throw new Error("lost response");
    },
    listWorkflows: async () => ({ data: [] })
  });
  await service.install(template.id);
  assert.equal((await service.reconcile(template.id)).state, "unconfirmed");
});

test("corrupt state fails closed rather than forgetting installed workflows", async (t) => {
  let creates = 0;
  const { service, options } = await fixture(t, {
    createWorkflow: async () => {
      creates++;
    }
  });
  await writeFile(options.statePath, "broken journal");
  await assert.rejects(service.install(template.id));
  assert.equal(creates, 0);
});

test("explicit rejected retry creates once and stale retry buttons cannot duplicate it", async (t) => {
  let creates = 0;
  const { service } = await fixture(t, {
    createWorkflow: async (workflow) => {
      creates++;
      if (creates === 1) throw Object.assign(new Error("Rejected"), { outcome: "rejected" });
      assert.equal(workflow.nodes[1].parameters.rule.interval[0].hoursInterval, 6);
      return { ...workflow, id: "retried-workflow" };
    }
  });
  const rejected = await service.install(template.id);
  assert.equal((await service.install(template.id)).state, "rejected");
  const [first, second] = await Promise.all([
    service.install(template.id, { hoursInterval: 6 }, rejected.operationId),
    service.install(template.id, { hoursInterval: 6 }, rejected.operationId)
  ]);
  assert.equal(first.state, "installed");
  assert.deepEqual(first, second);
  assert.equal(creates, 2);
});

test("uncertain writes cannot be retried even with their operation ID", async (t) => {
  let creates = 0;
  const { service } = await fixture(t, {
    createWorkflow: async () => {
      creates++;
      throw new Error("Lost response");
    }
  });
  const uncertain = await service.install(template.id);
  await service.install(template.id, { hoursInterval: 2 }, uncertain.operationId);
  assert.equal(creates, 1);
});

test("invalid settings fail before writing an installation receipt or contacting n8n", async (t) => {
  const { service } = await fixture(t, { createWorkflow: async () => assert.fail("Must not call n8n") });
  await assert.rejects(service.install(template.id, { hoursInterval: -1 }));
  assert.deepEqual((await service.read()).installations, {});
});
