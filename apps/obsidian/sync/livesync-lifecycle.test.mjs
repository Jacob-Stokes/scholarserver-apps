import assert from "node:assert/strict";
import test from "node:test";
import { activateLiveSyncWorker, prepareLiveSyncWorker, restoredLiveSyncState } from "./livesync-lifecycle.mjs";

test("the server worker remains stopped until the first Obsidian device is ready", () => {
  const prepared = prepareLiveSyncWorker({ revision: 1, setupURI: "obsidian://setup", setupPassphrase: "secret" });
  assert.equal(prepared.enabled, false);
  assert.equal(prepared.initializeAfterFirstDevice, true);
  assert.equal(restoredLiveSyncState({}, prepared), "livesync-device-setup");
});

test("finishing device setup activates the prepared worker without losing its one-time credentials", () => {
  const prepared = prepareLiveSyncWorker({ revision: 1, setupURI: "obsidian://setup", setupPassphrase: "secret" });
  const activated = activateLiveSyncWorker(prepared, 2);
  assert.equal(activated.enabled, true);
  assert.equal(activated.revision, 2);
  assert.equal(activated.setupURI, "obsidian://setup");
  assert.equal(activated.setupPassphrase, "secret");
  assert.equal(restoredLiveSyncState({}, activated), "livesync-server-joining");
});

test("a completed onboarding restores as ready", () => {
  assert.equal(restoredLiveSyncState(null, { enabled: true }), "ready");
});
