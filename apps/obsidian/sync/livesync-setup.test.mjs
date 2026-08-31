import assert from "node:assert/strict";
import test from "node:test";
import { applyScholarServerLiveSyncDefaults } from "./livesync-settings.mjs";

test("generated device settings enable automatic continuous synchronization", () => {
  const settings = applyScholarServerLiveSyncDefaults({});

  assert.equal(settings.liveSync, true);
  assert.equal(settings.syncOnSave, true);
  assert.equal(settings.syncOnEditorSave, true);
  assert.equal(settings.syncOnStart, true);
  assert.equal(settings.syncOnFileOpen, true);
  assert.equal(settings.syncAfterMerge, true);
  assert.equal(settings.periodicReplication, true);
  assert.equal(settings.keepReplicationActiveInBackground, true);
  assert.equal(settings.isConfigured, true);
});
