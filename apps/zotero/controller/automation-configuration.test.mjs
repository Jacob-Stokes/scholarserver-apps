import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  automationConfigurationFixtures,
  processingFolders,
  processingView,
  unusedProcessingView
} from "./automation-configuration.fixtures.mjs";
import { automationConfiguration, createAutomationConfiguration } from "./automation-configuration.mjs";

async function fixture(context) {
  const directory = await mkdtemp(path.join(tmpdir(), "zotero-processing-configuration-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const view = structuredClone(processingView);
  const mutations = [];
  let loseResponse = false;
  let failReads = false;
  const settings = {
    directory,
    baseUrl: "https://worker.invalid/v1",
    async fetcher(url, init) {
      const route = new URL(url).pathname;
      if (!init.method || init.method === "GET") {
        if (failReads) throw new Error("Worker unavailable");
        if (route === "/v1/automations") return Response.json({ automations: [view] });
        if (route === "/v1/folders") return Response.json(processingFolders);
        throw new Error(`Unexpected route ${route}`);
      }
      mutations.push({ route, method: init.method, body: JSON.parse(init.body) });
      if (init.method === "PUT") {
        Object.assign(view.configuration, JSON.parse(init.body), { updatedAt: "2026-09-29T09:00:00Z" });
      }
      if (loseResponse) throw new Error("Connection closed after dispatch");
      return Response.json({});
    }
  };
  return {
    settings,
    view,
    mutations,
    api: createAutomationConfiguration(settings),
    loseResponse: () => {
      loseResponse = true;
    },
    failReads: () => {
      failReads = true;
    }
  };
}

function saveValues(section) {
  const ids = section.actions.find((action) => action.id === "save-automation").fieldIds;
  return Object.fromEntries(ids.map((id) => [id, section.values[id]]));
}

test("unused processing directs new workflows to Automations without setup controls or prerequisite errors", () => {
  const before = structuredClone(unusedProcessingView);
  const section = automationConfiguration(unusedProcessingView, { editSettings: true, showHistory: true });
  assert.match(section.description, /Automations/);
  assert.deepEqual(section.fields, []);
  assert.deepEqual(section.actions, []);
  assert.deepEqual(section.notices, []);
  assert.equal(section.pollAfterMs, null);
  assert.deepEqual(unusedProcessingView, before);
});

test("inactive customized settings, saved defaults and old failures retain their recovery controls", () => {
  for (const change of [
    { intervalMinutes: 90 },
    { updatedAt: "2026-09-29T08:00:00Z" },
    { configuration: { ...unusedProcessingView.configuration.configuration, ocr: true } },
    { runs: [{ id: "previous-run", state: "failed", error: "Previous conversion failed" }] }
  ]) {
    const view = { ...unusedProcessingView, configuration: { ...unusedProcessingView.configuration, ...change } };
    const section = automationConfiguration(view, { editSettings: true, showHistory: true });
    assert.equal(section.title, "Previous PDF processing");
    assert.ok(section.actions.some((action) => action.id === "save-automation"));
    assert.ok(section.fields.some((field) => field.id === "showHistory"));
    if (change.runs) assert.ok(section.notices.some((notice) => notice.kind === "error"));
  }
});

test("forged processing setup on an unused installation is rejected without worker mutation", async (context) => {
  const { api, view, mutations } = await fixture(context);
  view.configuration = structuredClone(unusedProcessingView.configuration);
  const section = await api.section({ editSettings: true });
  const result = await api.run("save-automation", {
    requestId: "unused-processing-forged-001",
    expectedRevision: section.revision,
    values: { editSettings: true, active: true }
  });
  assert.equal(result.status, "rejected-before-change");
  assert.deepEqual(mutations, []);
  assert.deepEqual(view.configuration, unusedProcessingView.configuration);
});

test("saved schedules and non-default settings remain visible without enabling processing", () => {
  const section = automationConfigurationFixtures["processing-scheduled"];
  assert.ok(section.summary.some((item) => item.value === "Every 90 minutes"));
  assert.equal(
    section.fields.some((field) => field.id === "active"),
    false
  );
  const editing = automationConfigurationFixtures["processing-edit"];
  assert.equal(editing.values.intervalMinutes, 90);
  assert.equal(editing.values.ocr, true);
  assert.deepEqual(
    editing.fields.find((field) => field.id === "folder").options.map((option) => option.value),
    ["Papers", "/", "Papers/History"]
  );
  assert.equal(automationConfigurationFixtures["processing-inactive"].actions[0].disabled, true);
  assert.deepEqual(automationConfigurationFixtures["processing-online-library"].actions, []);
});

test("running, failed and unavailable workers retain their run controls and errors", () => {
  assert.equal(automationConfigurationFixtures["processing-running"].actions[0].disabled, true);
  assert.equal(automationConfigurationFixtures["processing-unavailable"].actions[0].disabled, true);
  const history = automationConfigurationFixtures["processing-history-error"];
  assert.ok(history.notices.some((notice) => notice.kind === "error"));
  assert.ok(history.summary.some((item) => item.label === "Trigger" && item.value === "Scheduled"));
  assert.equal(history.fields.find((field) => field.id === "runId").options.length, 1);
});

test("folder choices stay within the native contract and preserve a manual path fallback", () => {
  const many = {
    ...processingFolders,
    folders: Array.from({ length: 250 }, (_, index) => ({ name: `Folder ${index}`, path: `Papers/Folder ${index}` }))
  };
  const section = automationConfiguration(processingView, { editSettings: true }, { folderListing: many });
  assert.equal(section.fields.find((field) => field.id === "folder").options.length, 64);
  assert.ok(section.notices.some((notice) => notice.text.includes("relative path manually")));
  const manual = automationConfiguration(processingView, {
    editSettings: true,
    enterFolderPath: true,
    folder: "Papers/Custom"
  });
  assert.equal(manual.fields.find((field) => field.id === "folder").type, "text");
  assert.equal(manual.values.folder, "Papers/Custom");
});

test("saving preserves run history and a custom interval; duplicate requests never resave", async (context) => {
  const { api, view, mutations } = await fixture(context);
  view.configuration.runs.push({ id: "earlier-run", state: "succeeded" });
  const section = await api.section({ editSettings: true, enabled: false });
  const input = {
    requestId: "save-processing-fixture-001",
    expectedRevision: section.revision,
    values: { ...saveValues(section), active: false, enabled: false, folder: "/" }
  };
  assert.equal((await api.run("save-automation", input)).status, "succeeded");
  assert.equal(view.configuration.intervalMinutes, 90);
  assert.equal(view.configuration.configuration.folder, "");
  assert.equal(view.configuration.runs.length, 1);
  assert.equal(view.configuration.enabled, false);
  assert.equal((await api.run("save-automation", input)).status, "succeeded");
  assert.equal(mutations.length, 1);
});

test("stale settings, fractional limits and escaping paths are rejected before dispatch", async (context) => {
  const { api, view, mutations } = await fixture(context);
  const section = await api.section({ editSettings: true });
  for (const [index, change] of [{ limit: 1.5 }, { folder: "../private" }, { folder: "/absolute" }].entries()) {
    assert.equal(
      (
        await api.run("save-automation", {
          requestId: `invalid-processing-${index}`,
          expectedRevision: section.revision,
          values: { ...saveValues(section), ...change }
        })
      ).status,
      "rejected-before-change"
    );
  }
  view.configuration.configuration.ocr = false;
  assert.equal(
    (
      await api.run("save-automation", {
        requestId: "stale-processing-0001",
        expectedRevision: section.revision,
        values: saveValues(section)
      })
    ).status,
    "rejected-before-change"
  );
  assert.deepEqual(mutations, []);
});

test("a lost run response survives adapter restart and blocks another run", async (context) => {
  const { api, settings, loseResponse, mutations } = await fixture(context);
  const section = await api.section();
  const input = { requestId: "run-processing-fixture-0001", expectedRevision: section.revision, values: {} };
  loseResponse();
  assert.equal((await api.run("run-automation", input)).status, "unconfirmed");
  const resumed = createAutomationConfiguration(settings);
  assert.equal((await resumed.run("run-automation", input)).status, "unconfirmed");
  assert.equal(
    (await resumed.run("run-automation", { ...input, requestId: "run-processing-fixture-0002" })).status,
    "rejected-before-change"
  );
  assert.equal((await resumed.read(input.requestId)).status, "unconfirmed");
  assert.equal(mutations.length, 1);
});

test("an online-only installation never contacts the unavailable processing worker", async (context) => {
  const { settings, failReads } = await fixture(context);
  failReads();
  const api = createAutomationConfiguration({ ...settings, online: true });
  const section = await api.section();
  assert.deepEqual(section.actions, []);
  assert.equal(
    (
      await api.run("run-automation", {
        requestId: "online-processing-fixture-001",
        expectedRevision: section.revision,
        values: {}
      })
    ).status,
    "rejected-before-change"
  );
});
