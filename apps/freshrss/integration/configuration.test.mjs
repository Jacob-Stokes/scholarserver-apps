import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  assertConfigurationActionRequest,
  ConfigurationActions
} from "@scholarserver/controller-runtime/configuration-actions";
import { bindingFingerprint } from "./browser-identity.mjs";
import { configurationSection, validateAppearanceValues } from "./configuration.mjs";
import { Setup } from "./setup.mjs";

async function fixture(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "freshrss-configuration-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const setup = new Setup(directory);
  await setup.initialize();
  await setup.connect({ username: "researcher", password: "Synthetic-long-password" });
  await writeFile(path.join(directory, "worker-status.json"), JSON.stringify({ phase: "ready", ready: true }));
  await writeFile(path.join(directory, "heartbeat"), "");
  return { directory, setup };
}

test("account section uses declared instance action and never displays the account password", async (t) => {
  const { setup } = await fixture(t);
  const account = await configurationSection(setup, "account");
  assert.equal(account.actions[0].target.kind, "instance-action");
  assert.equal(account.actions[0].target.actionId, "link-sign-in");
  assert.deepEqual(account.endpointIds, ["reader"]);
  assert.equal(JSON.stringify(account).includes("Synthetic-long-password"), false);
  assert.equal(account.instructions[0].link, undefined);
});

test("appearance action is revisioned and saves through existing setup function once", async (t) => {
  const { directory, setup } = await fixture(t);
  // The identity binding is produced by the normal executor action; this
  // minimal fixture only marks its state to exercise the appearance control.
  const binding = {
    version: 1,
    subject: "test",
    audience: "workspace/reader",
    username: "researcher",
    publicKey: "test"
  };
  await writeFile(path.join(directory, "browser-identity.json"), JSON.stringify(binding));
  await writeFile(
    path.join(directory, "browser-identity-ready.json"),
    JSON.stringify({ fingerprint: bindingFingerprint(binding) })
  );
  const section = await configurationSection(setup, "appearance");
  assert.equal(section.actions[0].disabled, undefined);
  const actions = new ConfigurationActions(path.join(directory, "configuration-actions"), "appearance");
  const input = assertConfigurationActionRequest(
    {
      requestId: "request-12345678",
      expectedRevision: section.revision,
      values: { style: "scholarserver" }
    },
    "save-appearance",
    "appearance"
  );
  const first = await actions.run(
    input,
    () => configurationSection(setup, "appearance"),
    (values) => setup.saveAppearance(values),
    validateAppearanceValues
  );
  assert.equal(first.status, "succeeded");
  assert.deepEqual(await setup.appearance(), { style: "scholarserver" });
  assert.deepEqual(
    await actions.run(
      input,
      () => configurationSection(setup, "appearance"),
      () => {
        throw new Error("duplicate write");
      },
      validateAppearanceValues
    ),
    first
  );
  assert.equal(
    JSON.stringify(await configurationSection(setup, "appearance")).includes("Synthetic-long-password"),
    false
  );
});

test("invalid appearance input creates no receipt", async (t) => {
  const { directory, setup } = await fixture(t);
  const actions = new ConfigurationActions(path.join(directory, "configuration-actions"), "appearance");
  const section = await configurationSection(setup, "appearance");
  const input = assertConfigurationActionRequest(
    {
      requestId: "request-12345678",
      expectedRevision: section.revision,
      values: { style: "custom" }
    },
    "save-appearance",
    "appearance"
  );
  await assert.rejects(
    actions.run(
      input,
      () => configurationSection(setup, "appearance"),
      () => {
        throw new Error("write should not run");
      },
      validateAppearanceValues
    )
  );
  assert.equal(await actions.read(input.requestId), null);
});
