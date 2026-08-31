import assert from "node:assert/strict";
import test from "node:test";
import { createScholarServerLiveSyncSettings } from "./livesync-setup.mjs";

test("generated device settings enable automatic continuous synchronization", () => {
  const settings = createScholarServerLiveSyncSettings({
    url: "https://sync.example.test",
    username: "scholarserver",
    password: "correct horse battery staple",
    database: "vault",
    vaultPassphrase: "encrypted vault passphrase"
  });

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
