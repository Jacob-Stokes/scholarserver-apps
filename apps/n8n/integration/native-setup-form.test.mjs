import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { readCatalog } from "./catalog.mjs";
import { assertNativeSetupRequest, N8nNativeSetupForm, NativeSetupFormError } from "./native-setup-form.mjs";

const templates = await readCatalog(new URL("../templates/", import.meta.url));
const templateId = "zotero-pdf-markdown";

function applications() {
  return [
    {
      id: "zotero-one",
      workspaceId: "personal",
      packageId: "org.scholarserver.zotero",
      actions: ["match-attachment", "attach-docling-result"]
    },
    {
      id: "docling-one",
      workspaceId: "personal",
      packageId: "org.scholarserver.docling",
      actions: ["discover", "enqueue", "job-status", "browse-folders"]
    },
    {
      id: "docling-other",
      workspaceId: "other",
      packageId: "org.scholarserver.docling",
      actions: ["discover", "enqueue", "job-status", "browse-folders"]
    }
  ];
}

function fixture(overrides = {}) {
  const currentApplications = applications();
  const calls = { folders: [], clients: 0, installs: [] };
  const researchBridge = {
    async applications() {
      if (overrides.applications) return overrides.applications(currentApplications);
      return currentApplications;
    },
    async folders(scope) {
      calls.folders.push(scope);
      return { path: scope.folder, parent: scope.folder ? "" : null, folders: [{ name: "Papers", path: "Papers" }] };
    }
  };
  const service = new N8nNativeSetupForm({
    templates,
    researchBridge,
    requiredClient: async () => {
      calls.clients++;
      return {};
    },
    installations: {
      async validateInstallRequest() {},
      async install(...args) {
        calls.installs.push(args);
        return { automationId: args[3], templateId: args[0], state: "installed", workflowId: "workflow-one" };
      }
    }
  });
  return { service, calls, currentApplications };
}

function valuesFrom(form) {
  return Object.fromEntries(form.fields.map((field) => [field.id, field.value]));
}

test("only the PDF conversion template advertises native setup version one", async () => {
  const server = await readFile(new URL("./server.mjs", import.meta.url), "utf8");
  assert.match(server, /setupFormVersion: nativeSetupFormVersion/);
  const { service } = fixture();
  await assert.rejects(service.evaluate("zotero-reading-notes"), /does not support native setup/);
  assert.equal((await service.evaluate(templateId)).version, 1);
});

test("initial evaluation selects compatible same-workspace apps and leaves the required folder empty", async () => {
  const { service } = fixture();
  const form = await service.evaluate(templateId);
  const values = valuesFrom(form);
  assert.equal(values.name, "Automatically convert new Zotero PDFs");
  assert.ok(values.source);
  assert.ok(values.target);
  assert.equal(values.folder, "");
  assert.equal(values.interval, "1");
  assert.equal(form.canSubmit, false);
  const target = form.fields.find((field) => field.id === "target");
  assert.deepEqual(
    target.options.map((option) => option.label),
    ["docling-one"]
  );
  assert.deepEqual(target.dependsOn, ["source"]);
  assert.deepEqual(form.fields.find((field) => field.id === "folder").dependsOn, ["source", "target"]);
});

test("initial evaluation leaves ambiguous source and target choices unselected", async () => {
  const multipleSources = fixture({
    applications(current) {
      return [
        ...current,
        {
          ...current[0],
          id: "zotero-two"
        }
      ];
    }
  });
  const sourceForm = await multipleSources.service.evaluate(templateId);
  assert.equal(sourceForm.fields.find((field) => field.id === "source").value, "");
  assert.equal(sourceForm.fields.find((field) => field.id === "target").disabled, true);

  const multipleTargets = fixture({
    applications(current) {
      return [
        ...current,
        {
          ...current[1],
          id: "docling-two"
        }
      ];
    }
  });
  const targetForm = await multipleTargets.service.evaluate(templateId);
  assert.equal(targetForm.fields.find((field) => field.id === "target").value, "");
  assert.equal(targetForm.fields.find((field) => field.id === "folder").disabled, true);
});

test("supplied drafts are preserved rather than replaced by defaults or current choices", async () => {
  const { service } = fixture();
  const draft = { name: "", source: "stale-source", target: "stale-target", folder: "Draft", interval: "7" };
  const form = await service.evaluate(templateId, draft);
  assert.deepEqual(valuesFrom(form), draft);
  assert.equal(form.canSubmit, false);
  assert.match(form.fields.find((field) => field.id === "source").error, /current Zotero/);
  assert.equal(form.fields.find((field) => field.id === "target").disabled, true);
});

test("unknown fields and invalid schedules are rejected before any client or installation write", async () => {
  const { service, calls } = fixture();
  await assert.rejects(
    service.submit(
      templateId,
      { name: "x", source: "", target: "", folder: "Papers", interval: "1", extra: "x" },
      randomUUID()
    ),
    NativeSetupFormError
  );
  const initial = valuesFrom(await service.evaluate(templateId));
  await assert.rejects(
    service.submit(templateId, { ...initial, folder: "Papers", interval: "0" }, randomUUID()),
    (error) => {
      assert.equal(error.status, 422);
      return true;
    }
  );
  assert.equal(calls.clients, 0);
  assert.equal(calls.installs.length, 0);
});

test("submitted strings are bounded and names reject controls before installation", async () => {
  const { service, calls } = fixture();
  const initial = valuesFrom(await service.evaluate(templateId));
  for (const values of [
    { ...initial, folder: "x".repeat(2001) },
    { ...initial, name: "Bad\nname", folder: "Papers" }
  ]) {
    await assert.rejects(service.submit(templateId, values, randomUUID()), NativeSetupFormError);
  }
  assert.equal(calls.clients, 0);
  assert.equal(calls.installs.length, 0);
});

test("request fields outside the exact contract, including caller-supplied versions, are rejected", () => {
  assert.doesNotThrow(() => assertNativeSetupRequest({ templateId, values: {} }, ["templateId", "values"]));
  assert.throws(
    () => assertNativeSetupRequest({ templateId, values: {}, version: 2 }, ["templateId", "values"]),
    /Unknown request field/
  );
});

test("folder browsing forwards the path but rejects stale or cross-workspace selections before the action", async () => {
  const { service, calls, currentApplications } = fixture();
  const values = valuesFrom(await service.evaluate(templateId));
  values.name = "";
  values.interval = "not-yet-valid";
  await service.folders(templateId, values, "Papers");
  assert.deepEqual(calls.folders[0].folder, "Papers");

  const target = (await service.evaluate(templateId)).fields.find((field) => field.id === "target");
  const otherWorkspace = currentApplications.find((application) => application.id === "docling-other");
  const crossWorkspaceValue = Buffer.from(JSON.stringify([otherWorkspace.workspaceId, otherWorkspace.id])).toString(
    "base64url"
  );
  await assert.rejects(service.folders(templateId, { ...values, target: crossWorkspaceValue }, "Papers"));
  assert.equal(
    target.options.some((option) => option.value === crossWorkspaceValue),
    false
  );
  assert.equal(calls.folders.length, 1);
});

test("missing grants and failed discovery are failures, not empty successful forms", async () => {
  const denied = fixture({
    applications() {
      throw new Error("manager denied the grant: secret upstream detail");
    }
  });
  await assert.rejects(denied.service.evaluate(templateId), /manager denied/);

  const missingAction = fixture({
    applications(current) {
      return current.map((application) =>
        application.id === "docling-one"
          ? { ...application, actions: application.actions.filter((action) => action !== "enqueue") }
          : application
      );
    }
  });
  const form = await missingAction.service.evaluate(templateId);
  assert.equal(form.canSubmit, false);
  assert.match(form.fields.find((field) => field.id === "target").error, /No compatible Docling/);

  const missingBrowseGrant = fixture({
    applications(current) {
      return current.map((application) =>
        application.id === "docling-one"
          ? { ...application, actions: application.actions.filter((action) => action !== "browse-folders") }
          : application
      );
    }
  });
  const browseForm = await missingBrowseGrant.service.evaluate(templateId);
  assert.equal(browseForm.canSubmit, false);
  assert.match(browseForm.fields.find((field) => field.id === "target").error, /folder browsing access/);
  assert.equal(browseForm.fields.find((field) => field.id === "folder").disabled, true);
});

test("submit revalidates current choices, then passes native settings and durable identity to installations", async () => {
  const { service, calls, currentApplications } = fixture();
  const values = {
    ...valuesFrom(await service.evaluate(templateId)),
    name: "PDF pilot",
    folder: "Papers",
    interval: "12"
  };
  const automationId = randomUUID();
  const receipt = await service.submit(templateId, values, automationId);
  assert.equal(receipt.state, "installed");
  assert.equal(calls.clients, 1);
  assert.deepEqual(calls.installs, [
    [
      templateId,
      {
        minutesInterval: 12,
        research: {
          workspaceId: "personal",
          zotero: "zotero-one",
          docling: "docling-one",
          folder: "Papers"
        }
      },
      null,
      automationId,
      "PDF pilot"
    ]
  ]);

  currentApplications.splice(0, currentApplications.length);
  await assert.rejects(service.submit(templateId, values, randomUUID()), (error) => {
    assert.equal(error.status, 422);
    return true;
  });
  assert.equal(calls.clients, 1);
  assert.equal(calls.installs.length, 1);
});

test("submit route reserves setup_form_invalid for definitive pre-write validation", async () => {
  const server = await readFile(new URL("./server.mjs", import.meta.url), "utf8");
  assert.match(
    server,
    /nativeSubmit[\s\S]*json\(response, 422, \{ code: "setup_form_invalid", error: error\.message \}\)/
  );
  assert.doesNotMatch(server, /nativeSubmit\s*&&[^\n]*AutomationConfigurationError/);
  assert.doesNotMatch(server, /state:\s*"setup_form_invalid"/);
});
