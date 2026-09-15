import assert from "node:assert/strict";
import test from "node:test";
import { ResearchBridge } from "./research-bridge.mjs";

const selection = { workspaceId: "personal", zotero: "library", docling: "documents", folder: "Papers" };

function fixture() {
  const bridge = new ResearchBridge({ managerConnection: {} });
  const applications = [
    {
      id: "library",
      workspaceId: "personal",
      packageId: "org.scholarserver.zotero",
      actions: ["match-attachment", "attach-docling-result"]
    },
    {
      id: "documents",
      workspaceId: "personal",
      packageId: "org.scholarserver.docling",
      actions: ["discover", "enqueue", "job-status", "browse-folders"]
    }
  ];
  const calls = [];
  bridge.applications = async () => applications;
  bridge.action = async (...args) => {
    calls.push(args);
    return { path: "Papers", parent: "", folders: [] };
  };
  return { bridge, applications, calls };
}

test("folder browsing invokes only the selected, permitted Docling action", async () => {
  const { bridge, calls } = fixture();
  assert.deepEqual(await bridge.folders(selection), { path: "Papers", parent: "", folders: [] });
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].slice(1), ["docling", "browse-folders", { path: "Papers" }]);
  assert.equal(calls[0][0].docling, "documents");
});

test("browse permits root navigation but rejects absolute, hidden and traversal paths", async () => {
  const { bridge, calls } = fixture();
  await bridge.folders({ ...selection, folder: "" });
  for (const folder of [
    "/Documents",
    "../secret",
    "Papers/.hidden",
    "Papers//Other",
    "Papers\\Other",
    "x\u0000",
    "x".repeat(201)
  ]) {
    await assert.rejects(bridge.folders({ ...selection, folder }), /relative folder/);
  }
  assert.equal(calls.length, 1);
});

test("browsing never bypasses missing grants or cross-workspace selections", async () => {
  const { bridge, applications, calls } = fixture();
  await assert.rejects(bridge.folders({ ...selection, workspaceId: "other" }), /unavailable/);
  applications[1].actions = applications[1].actions.filter((action) => action !== "browse-folders");
  await assert.rejects(bridge.folders(selection), /not been allowed/);
  assert.equal(calls.length, 0);
});

test("report browsing uses only the chosen same-workspace vault and requires metadata, note and browse access", async () => {
  const { bridge, applications, calls } = fixture();
  applications[0].actions.push("research-items");
  const vault = {
    id: "vault",
    workspaceId: "personal",
    packageId: "org.scholarserver.obsidian",
    actions: ["create-research-note", "browse-folders"]
  };
  applications.push(vault);
  const scope = { kind: "weekly-roundup", workspaceId: "personal", zotero: "library", obsidian: "vault", folder: "" };
  await bridge.folders(scope);
  assert.deepEqual(calls[0].slice(1), ["obsidian", "browse-folders", { path: "" }]);
  await assert.rejects(bridge.folders({ ...scope, kind: "arbitrary" }), /Unknown/);
  await assert.rejects(bridge.folders({ ...scope, workspaceId: "other" }), /unavailable/);
  for (const missing of ["create-research-note", "browse-folders"]) {
    vault.actions = ["create-research-note", "browse-folders"].filter((action) => action !== missing);
    await assert.rejects(bridge.folders(scope));
  }
  vault.actions = ["create-research-note", "browse-folders"];
  applications[0].actions = [];
  await assert.rejects(bridge.folders(scope));
  assert.equal(calls.length, 1);
});
