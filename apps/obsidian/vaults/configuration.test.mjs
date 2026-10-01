import assert from "node:assert/strict";
import test from "node:test";
import { obsidianConfigurationFixtures, obsidianMultiVaultFixtures } from "../sync/configuration.fixtures.mjs";
import { selectedVaultConfiguration } from "../sync/vault-configuration.mjs";

const registry = {
  schemaVersion: 1,
  revision: 3,
  vaults: [
    { id: "research", label: "Research", source: "official", layout: "managed", aiEnabled: true },
    { id: "notes", label: "Notes", source: "livesync", layout: "managed", aiEnabled: false }
  ]
};

test("every connection stage carries its selected context without mutating the child descriptor", () => {
  for (const childSection of obsidianConfigurationFixtures) {
    const before = structuredClone(childSection);
    const selected = registry.vaults[1];
    const section = selectedVaultConfiguration(registry, selected, "shared-revision", { childSection });
    assert.equal(section.values.vaultId, "notes");
    assert.equal(section.revision, "shared-revision");
    assert.equal(section.fields[0].selectsContext, true);
    for (const action of section.actions.filter((action) => action.kind === "submit")) {
      assert.equal(action.fieldIds[0], "vaultId");
    }
    for (const output of section.outputs ?? []) assert.ok(output.id.endsWith("-notes"));
    assert.deepEqual(childSection, before);
  }
});

test("empty, ready, disabled-access and storage-failure pages retain useful controls and truthful errors", () => {
  const cases = obsidianMultiVaultFixtures;
  assert.deepEqual(cases["setup-empty"].actions, []);
  assert.equal(cases["setup-empty"].notices[0].kind, "info");
  const ready = cases["setup-official-ready"];
  assert.equal(ready.values.scopePath, "Research");
  assert.ok(ready.actions.some((action) => action.id === "save-scope"));
  assert.equal(cases["access-notes-disabled"].values.aiEnabled, false);
  const damaged = cases["setup-storage-error"];
  assert.equal(damaged.notices[0].kind, "error");
  assert.deepEqual(
    damaged.fields[0].options.map((option) => option.value),
    ["research", "notes"]
  );
  assert.deepEqual(damaged.actions, []);
});

test("workspace uses one context for setup and access and separates adding from selecting a remote vault", async () => {
  const { vaultWorkspaceConfiguration } = await import("../sync/vault-workspace.mjs");
  const list = vaultWorkspaceConfiguration(registry, "revision");
  assert.equal(list.fields.length, 1);
  assert.equal(list.fields[0].presentation, "navigation");
  assert.deepEqual(list.actions, []);
  assert.equal(
    list.fields.some((field) => field.id === "label"),
    false
  );
  const choices = vaultWorkspaceConfiguration(registry, "revision", "add");
  assert.deepEqual(
    choices.fields[0].options.slice(2).map((option) => option.value),
    ["add-official", "add-livesync-existing", "add-livesync-new"]
  );
  const detail = vaultWorkspaceConfiguration(registry, "revision", "notes", {
    childSection: obsidianConfigurationFixtures[9]
  });
  assert.equal(detail.fields.filter((field) => field.selectsContext).length, 1);
  assert.equal(detail.values.vaultId, "notes");
  assert.equal(detail.values.aiEnabled, false);
  assert.equal(detail.values.label, "Notes");
  assert.ok(detail.actions.some((action) => action.id === "save-scope"));
  assert.ok(detail.actions.some((action) => action.id === "save-access"));
  assert.throws(() => vaultWorkspaceConfiguration(registry, "revision", "unknown"), /existing/);
});
