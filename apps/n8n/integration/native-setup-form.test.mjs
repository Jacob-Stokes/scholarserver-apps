import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { readCatalog } from "./catalog.mjs";
import {
  advertisesNativeSetup,
  assertNativeSetupRequest,
  N8nNativeSetupForm,
  NativeSetupFormError,
  nativeSetupFormVersion
} from "./native-setup-form.mjs";

const templates = await readCatalog(new URL("../templates/", import.meta.url));
const templateId = "zotero-pdf-markdown";

function applications() {
  return [
    {
      id: "zotero-one",
      workspaceId: "personal",
      packageId: "org.scholarserver.zotero",
      actions: ["match-attachment", "attach-docling-result", "research-items"]
    },
    {
      id: "obsidian-one",
      workspaceId: "personal",
      packageId: "org.scholarserver.obsidian",
      actions: ["create-research-note", "browse-folders"]
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
  const calls = { discoveries: 0, folders: [], clients: 0, installs: [] };
  const researchBridge = {
    async applications() {
      calls.discoveries++;
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

test("all six reviewed research templates advertise native setup; unknown and mismatched templates do not", async () => {
  const server = await readFile(new URL("./server.mjs", import.meta.url), "utf8");
  assert.match(server, /setupFormVersion: nativeSetupFormVersion/);
  assert.equal(nativeSetupFormVersion, 2);
  const { service } = fixture();
  const supported = templates.filter(advertisesNativeSetup);
  assert.equal(supported.length, 6);
  for (const template of supported) assert.equal((await service.evaluate(template.id)).version, 1);
  await assert.rejects(service.evaluate("connection-check"), /does not support native setup/);
  assert.equal(advertisesNativeSetup({ id: templateId, research: "reading-notes" }), false);
  assert.equal(advertisesNativeSetup({ id: "unknown", research: "reading-notes" }), false);
});

for (const template of templates.filter((item) => advertisesNativeSetup(item) && item.id !== templateId)) {
  test(`${template.id}: native vault picker, hour interval and app-owned scope reach installation unchanged`, async () => {
    const { service, calls } = fixture();
    const form = await service.evaluate(template.id);
    const values = { ...valuesFrom(form), folder: "Research", interval: "12" };
    const folder = form.fields.find((field) => field.id === "folder");
    assert.equal(folder.type, "folder");
    assert.equal(form.fields.find((field) => field.id === "target").label, "Obsidian vault");
    assert.equal(form.fields.find((field) => field.id === "interval").label, "Run every (hours)");
    assert.equal(form.canSubmit, false);
    await service.folders(template.id, values, "Research");
    assert.deepEqual(calls.folders[0], {
      kind: template.research,
      workspaceId: "personal",
      zotero: "zotero-one",
      obsidian: "obsidian-one",
      folder: "Research"
    });
    const ready = await service.evaluate(template.id, values);
    assert.equal(ready.canSubmit, true);
    assert.match(ready.fields.find((field) => field.id === "folder").hint, /Existing notes are not replaced/);
    const automationId = randomUUID();
    await service.submit(template.id, values, automationId);
    assert.deepEqual(calls.installs[0], [
      template.id,
      {
        hoursInterval: 12,
        research: { workspaceId: "personal", zotero: "zotero-one", obsidian: "obsidian-one", folder: "Research" }
      },
      null,
      automationId,
      template.name
    ]);
  });
}

test("report form preserves drafts and rejects revoked vault access, long output paths and excessive intervals before writes", async () => {
  const { service, calls, currentApplications } = fixture();
  const reportId = "zotero-weekly-roundup";
  const values = { ...valuesFrom(await service.evaluate(reportId)), folder: "a".repeat(200) };
  const invalid = await service.evaluate(reportId, values);
  assert.equal(invalid.canSubmit, false);
  assert.match(invalid.fields.find((field) => field.id === "folder").error, /shorter folder/);
  await assert.rejects(service.submit(reportId, values, randomUUID()), NativeSetupFormError);
  for (const report of templates.filter((item) => advertisesNativeSetup(item) && item.id !== templateId)) {
    const initial = await service.evaluate(report.id);
    const intervalField = initial.fields.find((field) => field.id === "interval");
    await assert.rejects(
      service.submit(
        report.id,
        {
          ...valuesFrom(initial),
          folder: "Research",
          interval: String(intervalField.max + 1)
        },
        randomUUID()
      ),
      NativeSetupFormError
    );
  }
  const vault = currentApplications.find((application) => application.id === "obsidian-one");
  vault.actions = ["create-research-note"];
  const draft = { ...values, folder: "Keep my draft", interval: "12" };
  const revoked = await service.evaluate(reportId, draft);
  assert.deepEqual(valuesFrom(revoked), draft);
  assert.equal(revoked.canSubmit, false);
  await assert.rejects(service.folders(reportId, draft, "Research"));
  await assert.rejects(service.submit(reportId, draft, randomUUID()));
  assert.equal(calls.folders.length, 0);
  assert.equal(calls.clients, 0);
  assert.equal(calls.installs.length, 0);
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
          ...current.find((application) => application.id === "docling-one"),
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

test("only evaluation accepts an optional numeric version; inventory and permission assertions are rejected", () => {
  const evaluationKeys = ["templateId", "values", "version"];
  assert.doesNotThrow(() => assertNativeSetupRequest({ templateId, values: {} }, evaluationKeys));
  for (const version of [1, 2]) {
    assert.doesNotThrow(() => assertNativeSetupRequest({ templateId, values: {}, version }, evaluationKeys));
    for (const allowedKeys of [
      ["templateId", "values", "path"],
      ["templateId", "values", "automationId"]
    ]) {
      assert.throws(() => assertNativeSetupRequest({ templateId, version }, allowedKeys), /Unknown request field/);
    }
  }
  for (const version of [null, "2", true, 0, 3, 2.1, {}, []]) {
    assert.throws(
      () => assertNativeSetupRequest({ templateId, version }, evaluationKeys),
      /Unsupported setup form version/
    );
  }
  for (const extra of ["applications", "bindings", "permissions", "connections", "allowed", "available"]) {
    assert.throws(
      () => assertNativeSetupRequest({ templateId, version: 2, [extra]: [] }, evaluationKeys),
      /Unknown request field/
    );
  }
});

test("the setup route allowlists and forwards version while folder and submit contracts remain unchanged", async () => {
  const server = await readFile(new URL("./server.mjs", import.meta.url), "utf8");
  assert.match(server, /assertNativeSetupRequest\(input, \["templateId", "values", "version"\]\)/);
  assert.match(server, /nativeSetupForm\.evaluate\(input\.templateId, input\.values, input\.version\)/);
  assert.match(server, /assertNativeSetupRequest\(input, \["templateId", "values", "path"\]\)/);
  assert.match(server, /assertNativeSetupRequest\(input, \["templateId", "values", "automationId"\]\)/);
});

test("native acceptance requires v2 advertising but a binding-free v1 response when version is omitted", async () => {
  const harness = await readFile(new URL("./check-research-install.mjs", import.meta.url), "utf8");
  assert.match(harness, /body: JSON\.stringify\(\{ templateId: template\.id \}\)/);
  const advertisedVersion = harness.match(/^  assert\.equal\(template\.setupFormVersion,.*\);$/m)?.[0];
  const responseVersion = harness.match(/^  assert\.equal\(form\.version,.*\);$/m)?.[0];
  const absentBindings = harness.match(/^  assert\.equal\(Object\.hasOwn\(form, "bindings"\),.*\);$/m)?.[0];
  assert.ok(advertisedVersion && responseVersion && absentBindings, "the harness must assert both protocol versions");
  // Run only the real harness assertions with synthetic data, never its live
  // workflow writes, service requests or /runtime output files.
  const check = new Function(
    "assert",
    "template",
    "form",
    `${advertisedVersion}\n${responseVersion}\n${absentBindings}`
  );
  check(assert, { setupFormVersion: nativeSetupFormVersion }, { version: 1 });
  for (const [template, form] of [
    [{ setupFormVersion: 1 }, { version: 1 }],
    [{ setupFormVersion: 2 }, { version: 2 }],
    [{ setupFormVersion: 2 }, { version: 1, bindings: [] }],
    [{ setupFormVersion: 2 }, {}]
  ]) {
    assert.throws(() => check(assert, template, form), { code: "ERR_ASSERTION" });
  }
});

test("unsupported evaluation versions fail before service discovery", async () => {
  const { service, calls } = fixture();
  for (const version of [null, "2", true, 0, 3, 2.1, {}, []]) {
    await assert.rejects(service.evaluate(templateId, undefined, version), /Unsupported setup form version/);
  }
  assert.equal(calls.discoveries, 0);
});

function expectedBindings(template) {
  if (template.id === templateId) {
    return [
      {
        fieldId: "source",
        packageId: "org.scholarserver.zotero",
        actionIds: ["match-attachment", "attach-docling-result"]
      },
      {
        fieldId: "target",
        packageId: "org.scholarserver.docling",
        actionIds: ["discover", "enqueue", "job-status", "browse-folders"],
        dependsOn: ["source"]
      }
    ];
  }
  return [
    { fieldId: "source", packageId: "org.scholarserver.zotero", actionIds: ["research-items"] },
    {
      fieldId: "target",
      packageId: "org.scholarserver.obsidian",
      actionIds: ["create-research-note", "browse-folders"],
      dependsOn: ["source"]
    }
  ];
}

for (const template of templates.filter(advertisesNativeSetup)) {
  test(`${template.id}: v2 declares bounded select bindings without changing default or explicit v1 forms`, async () => {
    const { service } = fixture();
    const defaultForm = await service.evaluate(template.id);
    assert.equal(defaultForm.version, 1);
    assert.equal(Object.hasOwn(defaultForm, "bindings"), false);
    assert.deepEqual(await service.evaluate(template.id, undefined, 1), defaultForm);
    const v2 = await service.evaluate(template.id, undefined, 2);
    assert.deepEqual(v2, { ...defaultForm, version: 2, bindings: expectedBindings(template) });
    for (const binding of v2.bindings) {
      const field = v2.fields.find((field) => field.id === binding.fieldId);
      assert.equal(field.type, "select");
      assert.deepEqual(binding.dependsOn ?? [], field.dependsOn ?? []);
      assert.ok(binding.actionIds.length >= 1 && binding.actionIds.length <= 4);
    }
    v2.bindings[0].actionIds.push("caller-added-action");
    assert.deepEqual((await service.evaluate(template.id, undefined, 2)).bindings, expectedBindings(template));
    // Negotiation is request-local, not cached after a v2 evaluation.
    assert.deepEqual(await service.evaluate(template.id), defaultForm);
    assert.deepEqual(await service.evaluate(template.id, undefined, 1), defaultForm);
  });

  test(`${template.id}: unapproved owner drafts survive approval, partial access and revocation without authorizing operations`, async () => {
    const { service, calls, currentApplications } = fixture();
    const draft = { ...valuesFrom(await service.evaluate(template.id)), folder: "Research", name: "Owner draft" };
    const approvedApplications = currentApplications.splice(0);
    const emptyForm = await service.evaluate(template.id, undefined, 2);
    assert.equal(emptyForm.version, 2);
    assert.equal(emptyForm.canSubmit, false);
    assert.deepEqual(emptyForm.bindings, expectedBindings(template));
    for (const fieldId of ["source", "target"]) {
      assert.deepEqual(emptyForm.fields.find((field) => field.id === fieldId).options, []);
    }

    async function assertBlockedDraft() {
      const form = await service.evaluate(template.id, draft, 2);
      assert.deepEqual(valuesFrom(form), draft);
      assert.equal(form.canSubmit, false);
      assert.equal(form.fields.find((field) => field.id === "folder").disabled, true);
      await assert.rejects(service.folders(template.id, draft, ""), NativeSetupFormError);
      await assert.rejects(service.submit(template.id, draft, randomUUID()), NativeSetupFormError);
      assert.equal(calls.folders.length, 0);
      assert.equal(calls.clients, 0);
      assert.equal(calls.installs.length, 0);
      return form;
    }

    const unapproved = await assertBlockedDraft();
    // Manager may populate both pickers before saving any permission. An encoded
    // source only unlocks target presentation; it is not an authorized selection.
    assert.equal(unapproved.fields.find((field) => field.id === "target").disabled, undefined);
    const v1Draft = await service.evaluate(template.id, draft);
    assert.equal(v1Draft.fields.find((field) => field.id === "target").disabled, true);

    currentApplications.push(approvedApplications[0]);
    await assertBlockedDraft();
    const targetPackageId = expectedBindings(template)[1].packageId;
    const target = approvedApplications.find(
      (application) => application.workspaceId === "personal" && application.packageId === targetPackageId
    );
    currentApplications.push({ ...target, actions: target.actions.filter((action) => action !== "browse-folders") });
    await assertBlockedDraft();

    currentApplications[1] = target;
    const approvedForm = await service.evaluate(template.id, draft, 2);
    assert.equal(approvedForm.canSubmit, true);
    assert.deepEqual(valuesFrom(approvedForm), draft);
    assert.equal(approvedForm.fields.find((field) => field.id === "folder").disabled, undefined);

    currentApplications.splice(0);
    await assertBlockedDraft();
    currentApplications.push(...approvedApplications);
    await service.folders(template.id, draft, "");
    await service.submit(template.id, draft, randomUUID());
    assert.equal(calls.folders.length, 1);
    assert.equal(calls.clients, 1);
    assert.equal(calls.installs.length, 1);
  });
}

test("both negotiated versions preserve an explicit empty draft instead of restoring initial defaults", async () => {
  const { service } = fixture();
  for (const version of [2, 1]) {
    const form = await service.evaluate(templateId, {}, version);
    assert.equal(form.version, version);
    assert.deepEqual(valuesFrom(form), { name: "", source: "", target: "", folder: "", interval: "" });
    assert.equal(form.canSubmit, false);
    assert.equal(form.fields.find((field) => field.id === "target").disabled, true);
    assert.equal(form.fields.find((field) => field.id === "folder").disabled, true);
    await assert.rejects(service.evaluate(templateId, { version: "2" }, version), /Unknown setup form field/);
  }
});

test("v2 binding values use the fixed UTF-8 JSON tuple encoding, not app-specific identifiers", async () => {
  const { service } = fixture();
  const form = await service.evaluate(templateId, undefined, 2);
  for (const [fieldId, instanceId] of [
    ["source", "zotero-one"],
    ["target", "docling-one"]
  ]) {
    const value = form.fields.find((field) => field.id === fieldId).value;
    const json = JSON.stringify(["personal", instanceId]);
    assert.equal(value, Buffer.from(json, "utf8").toString("base64url"));
    assert.match(value, /^[A-Za-z0-9_-]+$/);
    assert.equal(Buffer.from(value, "base64url").toString("utf8"), json);
  }
  assert.equal(form.fields.find((field) => field.id === "source").value, "WyJwZXJzb25hbCIsInpvdGVyby1vbmUiXQ");
});

test("malformed v2 source tuples cannot unlock the target picker or authorize a submission", async () => {
  const { service, calls } = fixture({ applications: () => [] });
  const draft = { name: "Draft", source: "", target: "", folder: "Research", interval: "1" };
  const invalidSources = [
    "not-a-choice",
    "WyJwZXJzb25hbCIsInpvdGVyby1vbmUiXQ==",
    ...[["personal", 123], ["personal"], ["personal", "zotero", "extra"], ["../other", "zotero"]].map((tuple) =>
      Buffer.from(JSON.stringify(tuple), "utf8").toString("base64url")
    )
  ];
  for (const source of invalidSources) {
    const values = { ...draft, source };
    const form = await service.evaluate(templateId, values, 2);
    assert.deepEqual(valuesFrom(form), values);
    assert.equal(form.fields.find((field) => field.id === "target").disabled, true);
    assert.equal(form.canSubmit, false);
    await assert.rejects(service.folders(templateId, values, ""), NativeSetupFormError);
    await assert.rejects(service.submit(templateId, values, randomUUID()), NativeSetupFormError);
  }
  assert.equal(calls.clients, 0);
  assert.equal(calls.folders.length, 0);
  assert.equal(calls.installs.length, 0);
});

test("v2 still rejects cross-workspace targets and permission or inventory fields inside draft values", async () => {
  const { service, calls } = fixture();
  const draft = { ...valuesFrom(await service.evaluate(templateId, undefined, 2)), folder: "Research" };
  draft.target = Buffer.from(JSON.stringify(["other", "docling-other"]), "utf8").toString("base64url");
  const crossWorkspace = await service.evaluate(templateId, draft, 2);
  assert.equal(crossWorkspace.canSubmit, false);
  assert.equal(crossWorkspace.fields.find((field) => field.id === "folder").disabled, true);
  await assert.rejects(service.folders(templateId, draft, ""), NativeSetupFormError);
  await assert.rejects(service.submit(templateId, draft, randomUUID()), NativeSetupFormError);
  for (const extra of ["permissions", "applications", "bindings", "allowed", "available"]) {
    await assert.rejects(service.evaluate(templateId, { ...draft, [extra]: "true" }, 2), /Unknown setup form field/);
  }
  assert.equal(calls.folders.length, 0);
  assert.equal(calls.clients, 0);
  assert.equal(calls.installs.length, 0);
});

test("an approved target cannot authorize an unapproved v2 source even when the target picker has options", async () => {
  const { service, calls, currentApplications } = fixture();
  const draft = { ...valuesFrom(await service.evaluate(templateId, undefined, 2)), folder: "Papers" };
  currentApplications.splice(0, 1);
  const form = await service.evaluate(templateId, draft, 2);
  const targetField = form.fields.find((field) => field.id === "target");
  assert.deepEqual(
    targetField.options.map((option) => option.label),
    ["docling-one"]
  );
  assert.equal(targetField.disabled, undefined);
  assert.deepEqual(valuesFrom(form), draft);
  assert.equal(form.fields.find((field) => field.id === "folder").disabled, true);
  assert.equal(form.canSubmit, false);
  await assert.rejects(service.folders(templateId, draft, ""), NativeSetupFormError);
  await assert.rejects(service.submit(templateId, draft, randomUUID()), NativeSetupFormError);
  assert.equal(calls.folders.length, 0);
  assert.equal(calls.clients, 0);
  assert.equal(calls.installs.length, 0);
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
  for (const version of [1, 2]) {
    await assert.rejects(denied.service.evaluate(templateId, undefined, version), /manager denied/);
  }

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
