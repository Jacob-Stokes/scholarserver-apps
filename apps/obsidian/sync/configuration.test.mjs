import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  assertConfigurationActionRequest,
  ConfigurationActions
} from "../../../packages/controller-runtime/configuration-actions.mjs";
import { obsidianConfigurationFixtures } from "./configuration.fixtures.mjs";
import { attachCurrentSectionWhenAvailable, validateObsidianConfigurationAction } from "./configuration.mjs";

test("LiveSync advances through preparation, explicit device output, joining and ready without echoing credentials", () => {
  const [setup, preparing, device, joining, ready] = obsidianConfigurationFixtures.slice(5, 10);
  assert.equal(setup.stage.id, "livesync");
  assert.deepEqual(setup.endpointIds, ["livesync-couchdb"]);
  assert.equal(setup.fields.find((field) => field.id === "connectionUrl").sourceEndpointId, "livesync-couchdb");
  assert.deepEqual(
    setup.fields.find((field) => field.id === "accessMethod").options.map((item) => item.value),
    ["tailscale"]
  );
  assert.equal(preparing.stage.id, "joining");
  assert.deepEqual(
    device.outputs.map((output) => output.id),
    ["setup-uri", "setup-passphrase"]
  );
  assert.equal(device.actions[0].id, "complete-livesync");
  assert.equal(joining.actions.length, 0);
  assert.equal(ready.stage.id, "ready");
  assert.ok(!JSON.stringify(obsidianConfigurationFixtures).includes("setupPassphrase"));
});

test("official Sync and recovery reflect actual status stages without offering vault replacement", () => {
  const [choice, install, login, vault, ready, , , , , , recovery] = obsidianConfigurationFixtures;
  assert.equal(choice.actions[0].id, "select-profile");
  assert.equal(install.actions[0].id, "install-client");
  assert.equal(login.actions[0].id, "login");
  assert.equal(vault.fields[0].options[0].value, "remote-vault");
  assert.equal(
    ready.actions.some((action) => action.id === "connect-vault"),
    false
  );
  assert.equal(recovery.actions.length, 0);
});

test("LiveSync validation rejects unsafe connection and mismatched passphrases before receipt", () => {
  const values = {
    accessMethod: "tailscale",
    connectionUrl: "https://vault.example.ts.net:8443",
    vaultPassphrase: "long enough passphrase",
    vaultPassphraseAgain: "long enough passphrase",
    scopePath: "/",
    confirmedNoOtherSync: true
  };
  assert.doesNotThrow(() => validateObsidianConfigurationAction("configure-livesync", values));
  assert.throws(
    () => validateObsidianConfigurationAction("configure-livesync", { ...values, vaultPassphraseAgain: "other" }),
    /do not match/
  );
  assert.throws(
    () =>
      validateObsidianConfigurationAction("configure-livesync", {
        ...values,
        connectionUrl: "https://other.example.org"
      }),
    /Tailscale/
  );
  assert.throws(
    () => validateObsidianConfigurationAction("configure-livesync", { ...values, confirmedNoOtherSync: false }),
    /Confirm/
  );
});

test("LiveSync action receipt survives reload without storing passphrase or replaying setup", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "obsidian-config-test-"));
  try {
    const section = obsidianConfigurationFixtures[5];
    const values = {
      accessMethod: "tailscale",
      connectionUrl: "https://vault.example.ts.net:8443",
      vaultPassphrase: "long enough passphrase",
      vaultPassphraseAgain: "long enough passphrase",
      scopePath: "/",
      confirmedNoOtherSync: true
    };
    const input = assertConfigurationActionRequest(
      { requestId: "obsidian-request-0001", expectedRevision: section.revision, values },
      "configure-livesync",
      "setup"
    );
    let applied = 0;
    const apply = async () => {
      applied += 1;
    };
    const first = new ConfigurationActions(directory, "setup");
    const saved = await first.run(
      input,
      () => section,
      apply,
      (draft) => {
        validateObsidianConfigurationAction(input.actionId, draft);
        return draft;
      }
    );
    assert.equal(saved.status, "succeeded");
    const responseAfterRefreshFailure = await attachCurrentSectionWhenAvailable(saved, async () => {
      throw new Error("status read failed");
    });
    assert.deepEqual(responseAfterRefreshFailure, saved);
    const afterReload = new ConfigurationActions(directory, "setup");
    assert.equal((await afterReload.run(input, () => section, apply)).status, "succeeded");
    assert.equal(applied, 1);
    const receipt = await readFile(path.join(directory, "obsidian-request-0001.json"), "utf8");
    assert.ok(!receipt.includes(values.vaultPassphrase));
    assert.ok(!receipt.includes(values.connectionUrl));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
