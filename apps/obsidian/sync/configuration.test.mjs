import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  assertConfigurationActionRequest,
  ConfigurationActionRejected,
  ConfigurationActions
} from "../../../packages/controller-runtime/configuration-actions.mjs";
import { obsidianConfigurationFixtures } from "./configuration.fixtures.mjs";
import {
  attachCurrentSectionWhenAvailable,
  obsidianConfiguration,
  validateObsidianConfigurationAction
} from "./configuration.mjs";
import { officialCommandFailure, unconfiguredVaultRejection } from "./official-failure.mjs";

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
  assert.equal(ready.stage, undefined, "connected settings do not show unfinished setup steps");
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

test("ready configuration reports the selected sync worker rather than the other mode", () => {
  const officialRunning = obsidianConfiguration({
    profile: "official",
    state: "ready",
    workerRunning: true,
    liveSyncWorker: { running: false }
  });
  const liveSyncRunning = obsidianConfiguration({
    profile: "livesync",
    state: "ready",
    workerRunning: false,
    liveSyncWorker: { running: true }
  });
  const liveSyncStopped = obsidianConfiguration({
    profile: "livesync",
    state: "ready",
    workerRunning: true,
    liveSyncWorker: { running: false }
  });
  const serverSync = (section) => section.summary.find((item) => item.label === "Server sync")?.value;

  assert.equal(serverSync(officialRunning), "Running");
  assert.equal(serverSync(liveSyncRunning), "Running");
  assert.equal(serverSync(liveSyncStopped), "Not confirmed running");
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

test("device address repair is explicit, retains the saved revision and hides stale setup outputs", () => {
  const status = { profile: "livesync", state: "livesync-device-setup" };
  const saved = { deviceConnectionUrl: "https://vault.example.ts.net:8443" };
  const device = obsidianConfiguration(status, saved);
  const repair = obsidianConfiguration(status, { ...saved, values: { repairConnection: true } });
  assert.equal(device.actions[0].id, "complete-livesync");
  assert.equal(repair.actions[0].id, "repair-livesync-connection");
  assert.equal(repair.revision, device.revision);
  assert.equal(repair.outputs, undefined);
  assert.deepEqual(repair.endpointIds, ["livesync-couchdb"]);
  assert.equal(repair.fields.find((field) => field.id === "connectionUrl").sourceEndpointId, "livesync-couchdb");

  const updated = obsidianConfiguration(status, { deviceConnectionUrl: "https://vault.example.ts.net:14000" });
  assert.notEqual(updated.revision, device.revision, "a repaired address must invalidate revealed setup credentials");
  for (const state of ["ready", "livesync-server-joining", "recovery-required"]) {
    const section = obsidianConfiguration({ ...status, state }, { ...saved, values: { repairConnection: true } });
    assert.ok(!section.actions.some((action) => action.id === "repair-livesync-connection"));
  }
});

test("repair rejects unconfirmed or non-private addresses before a receipt is written", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "obsidian-config-repair-test-"));
  try {
    const status = { profile: "livesync", state: "livesync-device-setup" };
    let connectionUrl = "https://vault.example.ts.net:8443";
    const prepare = ({ values }) => obsidianConfiguration(status, { deviceConnectionUrl: connectionUrl, values });
    const actions = new ConfigurationActions(directory, "setup");
    const expectedRevision = prepare({ values: {} }).revision;
    let applied = 0;
    const apply = async (values) => {
      applied++;
      connectionUrl = values.connectionUrl;
    };
    const validate = (values) => {
      validateObsidianConfigurationAction("repair-livesync-connection", values);
      return values;
    };
    for (const [index, values] of [
      { repairConnection: false, connectionUrl: "https://vault.example.ts.net:14000" },
      { repairConnection: true, connectionUrl: "https://public.example.org" },
      { repairConnection: true, connectionUrl: "https://vault.example.ts.net:14000/path" }
    ].entries()) {
      const input = assertConfigurationActionRequest(
        { requestId: `repair-refusal-000${index}`, expectedRevision, values },
        "repair-livesync-connection",
        "setup"
      );
      await assert.rejects(actions.run(input, prepare, apply, validate));
      assert.equal(await actions.read(input.requestId), null);
    }
    assert.equal(applied, 0);
    const request = assertConfigurationActionRequest(
      {
        requestId: "repair-success-0001",
        expectedRevision,
        values: { repairConnection: true, connectionUrl: "https://vault.example.ts.net:14000" }
      },
      "repair-livesync-connection",
      "setup"
    );
    assert.equal((await actions.run(request, prepare, apply, validate)).status, "succeeded");
    assert.equal((await actions.run(request, prepare, apply, validate)).status, "succeeded");
    assert.equal(applied, 1, "an observed receipt must not replay the repair");
    await assert.rejects(
      actions.run({ ...request, requestId: "repair-stale-000001" }, prepare, apply, validate),
      /Configuration changed/
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
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

test("native setup retains worker/download failures and blocks a second in-progress download", () => {
  const worker = obsidianConfiguration({
    profile: "livesync",
    state: "ready",
    lastError: "Sync stopped.",
    liveSyncWorker: { running: false, lastError: "Sync stopped." }
  });
  assert.deepEqual(
    worker.notices.filter((notice) => notice.kind === "error"),
    [{ kind: "error", text: "Sync stopped." }]
  );
  for (const phase of ["downloading", "verifying"]) {
    const pending = obsidianConfiguration({
      profile: "official",
      state: "client-install-required",
      officialClient: { phase, approvedVersion: "1.0.0" }
    });
    assert.equal(pending.actions[0].disabled, true);
    assert.equal(
      pending.summary.some((item) => item.label === "Download"),
      true
    );
    assert.equal(pending.instructions[0].link.url, "https://obsidian.md/terms");
  }
  const failed = obsidianConfiguration({
    profile: "official",
    state: "client-install-required",
    officialClient: { phase: "failed", error: "Download verification failed." }
  });
  assert.equal(failed.actions[0].disabled, false);
  assert.equal(
    failed.notices.some((notice) => notice.kind === "error" && notice.text === "Download verification failed."),
    true
  );
});

test("vault password rejection is retryable without exposing upstream output; transport and other failures remain uncertain", () => {
  const error = officialCommandFailure("vault", "Failed to validate password. Wrong vault key. synthetic-secret");
  assert.ok(error instanceof ConfigurationActionRejected);
  assert.match(error.message, /encryption password was not accepted/);
  assert.ok(!error.message.includes("synthetic-secret"));
  assert.ok(officialCommandFailure("vault", "Password not provided.") instanceof ConfigurationActionRejected);
  for (const output of ["Failed to validate password. Network unavailable", "Unexpected failure"]) {
    assert.ok(!(officialCommandFailure("vault", output) instanceof ConfigurationActionRejected));
  }
});

test("old uncertain vault setup is retryable only when idle with no replica, connection or enrollment", () => {
  const observed = {
    receipt: { sectionId: "setup", actionId: "connect-vault", status: "unconfirmed" },
    status: { profile: "official", state: "vault-selection-required" },
    busy: false,
    enrolled: false,
    vaultEntries: [],
    localVaults: []
  };
  assert.ok(unconfiguredVaultRejection(observed) instanceof ConfigurationActionRejected);
  for (const override of [
    { busy: true },
    { enrolled: true },
    { vaultEntries: [".obsidian"] },
    { localVaults: [{ id: "some-vault" }] },
    { localVaults: undefined },
    { status: { profile: "official", state: "initial-sync" } },
    { status: { profile: "livesync", state: "vault-selection-required" } },
    { receipt: { ...observed.receipt, actionId: "configure-livesync" } }
  ])
    assert.equal(unconfiguredVaultRejection({ ...observed, ...override }), null);
});

test("credential rejection persists across restart and allows a corrected request without replaying secrets", async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), "obsidian-rejected-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const actions = new ConfigurationActions(directory, "setup");
  const section = obsidianConfigurationFixtures[3];
  const request = {
    requestId: "password-attempt-123",
    expectedRevision: section.revision,
    sectionId: "setup",
    actionId: "connect-vault",
    values: { vault: "remote-vault", scopePath: "/", encryptionPassword: "synthetic-secret" }
  };
  const result = await actions.run(
    request,
    () => section,
    () => {
      throw officialCommandFailure("vault", "Wrong vault key");
    }
  );
  assert.equal(result.status, "rejected");
  assert.ok(!JSON.stringify(await actions.read(request.requestId)).includes("synthetic-secret"));
  const restarted = new ConfigurationActions(directory, "setup");
  let applied = 0;
  assert.equal(
    (
      await restarted.run(
        request,
        () => section,
        () => {
          applied++;
        }
      )
    ).status,
    "rejected"
  );
  assert.equal(applied, 0);
  assert.equal(
    (
      await restarted.run(
        { ...request, requestId: "password-corrected-123" },
        () => section,
        () => {
          applied++;
        }
      )
    ).status,
    "succeeded"
  );
  assert.equal(applied, 1);
});

test("old incomplete connection reconciliation records a terminal receipt without replaying setup", async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), "obsidian-reconcile-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const actions = new ConfigurationActions(directory, "setup");
  const section = obsidianConfigurationFixtures[3];
  const request = {
    requestId: "old-vault-attempt-123",
    expectedRevision: section.revision,
    sectionId: "setup",
    actionId: "connect-vault",
    values: { vault: "remote-vault", scopePath: "/" }
  };
  await actions.run(
    request,
    () => section,
    () => {
      throw new Error("Lost result");
    }
  );
  await assert.rejects(
    actions.reconcileRejected(request.requestId, () => {
      throw new Error("Read unavailable");
    })
  );
  assert.equal((await actions.read(request.requestId)).status, "unconfirmed");
  const receipt = await actions.reconcileRejected(
    request.requestId,
    () => new ConfigurationActionRejected("No vault connection was created.")
  );
  assert.equal(receipt.status, "rejected");
  assert.equal((await new ConfigurationActions(directory, "setup").read(request.requestId)).status, "rejected");
});
