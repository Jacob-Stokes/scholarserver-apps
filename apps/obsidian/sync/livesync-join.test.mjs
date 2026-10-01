import assert from "node:assert/strict";
import test from "node:test";
import { decodeSettingsFromSetupURI } from "@vrtmrz/livesync-commonlib/compat/API/processSetting";
import { decodeExistingLiveSync, existingWorkerConfiguration, verifyExistingLiveSync } from "./livesync-join.mjs";
import { generateSetupUri } from "./livesync-setup.mjs";

const setup = await generateSetupUri({
  url: "https://existing.example.ts.net",
  username: "vault-member",
  password: "synthetic-member-password",
  database: "vault-existing",
  vaultPassphrase: "synthetic-encryption-password"
});

test("existing LiveSync import preserves database, encryption and member credentials without provisioning or unlocking", async () => {
  const connection = await decodeExistingLiveSync(setup.setupURI, setup.setupPassphrase);
  const requests = [];
  await verifyExistingLiveSync(connection, async (url, input) => {
    requests.push({ url, input });
    return new Response(JSON.stringify({ db_name: "vault-existing" }));
  });
  assert.equal(requests.length, 1);
  assert.equal(requests[0].input.method, "GET");
  assert.equal(requests[0].input.redirect, "error");
  assert.equal(requests[0].url, "https://existing.example.ts.net/vault-existing");
  const worker = await existingWorkerConfiguration(connection, setup.setupPassphrase, 7);
  assert.equal(worker.enabled, true);
  assert.equal(worker.initializeAfterFirstDevice, false);
  const imported = await decodeSettingsFromSetupURI(worker.setupURI, worker.setupPassphrase);
  for (const key of [
    "couchDB_URI",
    "couchDB_DBNAME",
    "couchDB_USER",
    "couchDB_PASSWORD",
    "passphrase",
    "encrypt",
    "usePathObfuscation"
  ])
    assert.equal(imported[key], connection.settings[key], key);
});

test("wrong URI/password, cleartext endpoints, different databases and denied access fail before enrollment", async () => {
  await assert.rejects(decodeExistingLiveSync(setup.setupURI, "wrong-passphrase"), /Could not open/);
  const insecure = await generateSetupUri({
    url: "http://localhost",
    username: "vault-member",
    password: "synthetic-member-password",
    database: "vault-existing",
    vaultPassphrase: "synthetic-encryption-password"
  });
  await assert.rejects(decodeExistingLiveSync(insecure.setupURI, insecure.setupPassphrase), /HTTPS/);
  const connection = await decodeExistingLiveSync(setup.setupURI, setup.setupPassphrase);
  await assert.rejects(
    verifyExistingLiveSync(connection, async () => new Response("{}", { status: 401 })),
    /HTTP 401/
  );
  await assert.rejects(
    verifyExistingLiveSync(connection, async () => new Response(JSON.stringify({ db_name: "other" }))),
    /selected/
  );
  await assert.rejects(
    verifyExistingLiveSync(connection, async () => {
      throw new Error("secret-bearing upstream failure");
    }),
    (error) => !error.message.includes("secret-bearing")
  );
});
