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

// Real upstream codec, synthetic credentials only. No CouchDB or network access.
const { generateSetupUri, repairDeviceOnboarding } = await import("./livesync-setup.mjs");
const { decodeSettingsFromSetupURI } = await import("@vrtmrz/livesync-commonlib/compat/API/processSetting");
const originalLink = await generateSetupUri({
  url: "https://manager.example.ts.net:8443",
  username: "vault-example",
  password: "synthetic-client-password",
  database: "vault-example",
  vaultPassphrase: "synthetic-vault-passphrase"
});
const onboarding = {
  ...originalLink,
  accessMethod: "tailscale",
  database: "vault-example",
  connectionUrl: "https://manager.example.ts.net:8443",
  revision: 123
};
const enrollment = { profile: "livesync", database: "vault-example" };
const worker = { enabled: false, setupURI: "synthetic-worker-uri", setupPassphrase: "synthetic-worker-password" };
const connectionUrl = "https://couchdb.example.ts.net";

test("pending link repair preserves vault credentials and encryption, and leaves worker records unchanged", async () => {
  const before = structuredClone({ onboarding, enrollment, worker });
  const repaired = await repairDeviceOnboarding({ onboarding, enrollment, worker, connectionUrl });
  const decoded = await decodeSettingsFromSetupURI(repaired.setupURI, repaired.setupPassphrase);
  assert.equal(decoded.syncMode, "LIVESYNC", "the device link must select continuous replication in LiveSync 1.0");
  assert.equal(decoded.couchDB_URI, connectionUrl);
  assert.equal(decoded.couchDB_DBNAME, "vault-example");
  assert.equal(decoded.couchDB_USER, "vault-example");
  assert.equal(decoded.couchDB_PASSWORD, "synthetic-client-password");
  assert.equal(decoded.passphrase, "synthetic-vault-passphrase");
  assert.equal(repaired.revision, onboarding.revision);
  assert.notEqual(repaired.setupPassphrase, onboarding.setupPassphrase);
  assert.deepEqual({ onboarding, enrollment, worker }, before);
  const reconciled = await repairDeviceOnboarding({ onboarding: repaired, enrollment, worker, connectionUrl });
  assert.equal(reconciled, repaired, "same-address reconciliation must not rotate another password");
});

test("repair rejects an active worker, mismatched database, missing records and public routes", async () => {
  for (const overrides of [
    { worker: { ...worker, enabled: true } },
    { worker: null },
    { onboarding: null },
    { enrollment: { ...enrollment, database: "another-vault" } },
    { connectionUrl: "https://public.example.com" },
    { connectionUrl: "http://couchdb.example.ts.net" },
    { connectionUrl: "https://couchdb.example.ts.net/database" },
    { connectionUrl: "https://user:password@couchdb.example.ts.net" }
  ]) {
    await assert.rejects(repairDeviceOnboarding({ onboarding, enrollment, worker, connectionUrl, ...overrides }));
  }
});

test("repair errors do not expose a damaged credential bundle", async () => {
  await assert.rejects(
    repairDeviceOnboarding({
      onboarding: { ...onboarding, setupURI: "sensitive-invalid-uri" },
      enrollment,
      worker,
      connectionUrl
    }),
    (error) => {
      assert(!error.message.includes("sensitive-invalid-uri"));
      assert.match(error.message, /saved device link/);
      return true;
    }
  );
});
