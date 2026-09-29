import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import YAML from "yaml";
import { zoteroLoginUrl } from "./account-link.mjs";
import { zoteroConfigurationFixtures } from "./configuration.fixtures.mjs";
import { attachCurrentSectionWhenAvailable, zoteroConfiguration } from "./configuration.mjs";
import { desktopWorkspaceStatus } from "./status-model.mjs";

test("both Zotero variants expose their actual account, storage and ready stages", () => {
  const [
    onlineAccount,
    onlineStorage,
    onlineReady,
    desktopAccount,
    desktopPending,
    desktopStorage,
    webdav,
    desktopAuthorization,
    desktopReady,
    recovery
  ] = zoteroConfigurationFixtures;
  assert.equal(onlineAccount.fields[0].type, "secret");
  assert.equal(onlineStorage.actions[0].id, "save-storage");
  assert.equal(onlineReady.stage, undefined, "connected settings do not show unfinished setup steps");
  assert.deepEqual(desktopAccount.endpointIds, ["desktop"]);
  assert.equal(desktopPending.outputs[0].id, "account-login-url");
  assert.ok(!JSON.stringify(desktopPending).includes("token=secret"));
  assert.equal(desktopStorage.stage.id, "storage");
  assert.equal(webdav.fields.find((field) => field.id === "password").type, "secret");
  assert.equal(desktopAuthorization.actions[0].id, "authorize-local");
  assert.equal(desktopReady.stage, undefined, "connected settings do not show unfinished setup steps");
  assert.ok(desktopReady.actions.some((action) => action.id === "sync-now"));
  assert.ok(!onlineReady.actions.some((action) => action.id === "sync-now"));
  assert.equal(recovery.stage.id, "recovery");
  assert.equal(recovery.actions.length, 0);
});

test("confirmed storage save remains confirmed when next status read fails", async () => {
  const receipt = { requestId: "zotero-request-0001", actionId: "save-storage", status: "succeeded" };
  assert.deepEqual(
    await attachCurrentSectionWhenAvailable(receipt, async () => {
      throw new Error("probe failed");
    }),
    receipt
  );
});

test("Zotero account handoff output uses the manifest-approved origin", async () => {
  const loginUrl = zoteroLoginUrl("https://www.zotero.org/login?session=synthetic");
  const manifest = YAML.parse(await readFile(new URL("../package/scholarserver-app.yaml", import.meta.url), "utf8"));
  const approved = new Set(manifest.presentation.details.links.map((link) => new URL(link.url).origin));
  assert.ok(approved.has(new URL(loginUrl).origin));
});

test("nonsecret WebDAV selection reconstructs applicable fields and action without a hidden stage token", () => {
  const status = desktopWorkspaceStatus({
    config: { userId: "123" },
    desktop: "available",
    localApi: "not-configured",
    version: "10.0.1",
    engine: { accountConnected: true, userId: "123" },
    lastError: null,
    variant: "complete-workspace"
  });
  const initial = zoteroConfiguration(status);
  const evaluated = zoteroConfiguration(status, { storageMode: "webdav" });
  assert.equal(
    initial.fields.some((field) => field.id === "password"),
    false
  );
  assert.equal(
    evaluated.fields.some((field) => field.id === "password"),
    true
  );
  assert.equal(initial.revision, evaluated.revision);
  assert.equal(evaluated.actions[0].id, "save-storage");
  assert.ok(!JSON.stringify(evaluated).includes("webdav-secret"));
});

test("a connected library can edit attachment settings without replaying account setup", () => {
  const status = {
    state: "ready",
    connectionMode: "desktop-workspace",
    accountConnected: true,
    userId: "123",
    storageMode: "zotero-storage",
    downloadMode: "on-demand",
    groupFileSync: false,
    localApi: "authorized"
  };
  const ready = zoteroConfiguration(status);
  const edit = zoteroConfiguration(status, { editStorage: true, storageMode: "webdav" });
  assert.equal(ready.fields[0].id, "editStorage");
  assert.equal(edit.revision, ready.revision);
  assert.equal(edit.stage, undefined, "editing saved settings is not a new setup stage");
  assert.equal(edit.actions[0].id, "save-storage");
  assert.ok(edit.actions[0].fieldIds.includes("editStorage"));
  assert.equal(edit.fields.find((field) => field.id === "password").type, "secret");
  assert.equal(
    zoteroConfiguration(status, { editStorage: false }).stage,
    undefined,
    "connected settings do not show unfinished setup steps"
  );
  assert.notEqual(zoteroConfiguration({ ...status, downloadMode: "on-sync" }).revision, ready.revision);
  assert.notEqual(zoteroConfiguration({ ...status, groupFileSync: true }).revision, ready.revision);
  assert.equal(
    zoteroConfiguration({ ...status, syncInProgress: true }).actions.find((action) => action.id === "sync-now")
      .disabled,
    true
  );

  const unavailable = zoteroConfiguration(
    { ...status, state: "setup-required", desktop: "unavailable" },
    { editStorage: true }
  );
  assert.equal(unavailable.stage.id, "recovery");
  assert.deepEqual(unavailable.actions, []);
});
