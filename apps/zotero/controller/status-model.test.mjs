import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { desktopWorkspaceStatus, onlineLibraryStatus } from "./status-model.mjs";

function online(values = {}) {
  return onlineLibraryStatus({
    config: null,
    account: null,
    accountError: null,
    lastError: null,
    variant: "online-library",
    ...values
  });
}

function desktop(values = {}) {
  return desktopWorkspaceStatus({
    config: null,
    desktop: "unavailable",
    localApi: "not-configured",
    version: null,
    engine: null,
    lastError: null,
    variant: "complete-workspace",
    ...values
  });
}

test("online setup requires account before storage and never advertises desktop features", () => {
  const config = { mode: "online-library", storageMode: "metadata-only" };
  assert.equal(online({ config }).state, "account-required");
  assert.equal(online({ account: { userId: "123" } }).state, "storage-required");
  const ready = online({ config, account: { userId: "123" } });
  assert.equal(ready.state, "ready");
  assert.deepEqual(ready.features, { desktop: false, automations: false, localAttachments: false });
  assert.equal(ready.desktop, "not-installed");
  assert.equal(ready.localApi, "not-applicable");
});

test("online status only uses saved online settings and gives explicit errors precedence", () => {
  const config = { mode: "online-library", username: "saved", userId: "123", storageMode: "zotero-storage" };
  const offline = online({ config, accountError: "Probe failed" });
  assert.equal(offline.userId, "123");
  assert.equal(offline.username, "saved");
  assert.equal(offline.lastError, "Probe failed");
  assert.equal(offline.accountConnected, false);
  assert.equal(offline.downloadMode, "on-demand");
  assert.equal(online({ config, accountError: "Probe failed", lastError: "Action failed" }).lastError, "Action failed");
  const otherMode = online({ config: { ...config, mode: "complete-workspace" } });
  assert.equal(otherMode.userId, null);
  assert.equal(otherMode.storageMode, null);
});

test("desktop setup precedence remains explicit when probes disagree", () => {
  assert.equal(desktop().state, "setup-required");
  const configured = { config: { storageMode: "server-only" }, localApi: "authorized" };
  assert.equal(
    desktop({ ...configured, desktop: "available", engine: { accountConnected: false } }).state,
    "account-required"
  );
  assert.equal(desktop({ desktop: "available", engine: { accountConnected: true } }).state, "storage-required");
  assert.equal(desktop(configured).state, "ready", "a failed ping does not override an independently authorized API");
  assert.equal(desktop({ config: configured.config, localApi: "read-only" }).state, "authorization-required");
  assert.equal(desktop({ config: { storageMode: "unknown" }, localApi: "authorized" }).state, "setup-required");
});

test("desktop status preserves settings and uses configured identity before bridge identity", () => {
  const config = { userId: "123", storageMode: "linked-folder" };
  const engine = {
    userId: "456",
    username: "researcher",
    accountConnected: true,
    storageVerified: true,
    groupFileSync: true,
    syncInProgress: true,
    linkedFolder: "/linked",
    linkedFolderAutomation: true,
    downloadMode: "on-sync"
  };
  const before = structuredClone({ config, engine });
  const result = desktop({ config, engine, localApi: "authorized", version: "test", lastError: "Synthetic error" });
  assert.equal(result.userId, "123");
  for (const key of [
    "username",
    "accountConnected",
    "storageVerified",
    "groupFileSync",
    "syncInProgress",
    "linkedFolder",
    "linkedFolderAutomation",
    "downloadMode"
  ])
    assert.equal(result[key], engine[key]);
  assert.equal(result.lastError, "Synthetic error");
  assert.equal(result.version, "test");
  assert.deepEqual(result.features, { desktop: true, automations: true, localAttachments: true });
  assert.deepEqual({ config, engine }, before);
});

test("the controller image explicitly includes the status model", async () => {
  const dockerfile = await readFile(new URL("./Dockerfile", import.meta.url), "utf8");
  assert.match(
    dockerfile,
    /COPY --chown=10001:10001 apps\/zotero\/controller\/status-model\.mjs \.\/status-model\.mjs/
  );
});
