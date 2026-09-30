import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { addVault, availableVaults, initializeRegistry, readRegistry, vaultPaths } from "../../vaults/registry.mjs";
import { createApi } from "./server.mjs";

function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "obsidian-vault-selection-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const runtime = path.join(directory, "runtime");
  const roots = { runtime, vaults: path.join(directory, "vaults"), legacyVault: path.join(directory, "legacy") };
  initializeRegistry({ runtime });
  function connect(label, source, scopePath = "/") {
    const vault = addVault(runtime, readRegistry(runtime).revision, { label, source });
    const paths = vaultPaths(vault, roots);
    fs.mkdirSync(paths.runtime, { recursive: true });
    fs.mkdirSync(paths.vault, { recursive: true });
    const remote = `remote-${vault.id}`;
    const enrollment =
      source === "official"
        ? { profile: source, remoteVault: remote, scopePath }
        : { profile: source, database: remote, scopePath };
    for (const [file, value] of Object.entries({
      "enrollment.json": enrollment,
      "status.json": { state: "ready" },
      "vault-binding.json": { version: 1, profile: source, vaultId: remote }
    })) {
      fs.writeFileSync(path.join(paths.runtime, file), JSON.stringify(value));
    }
    return { vault, paths };
  }
  const app = createApi({ runtime, roots, expectedKey: () => "synthetic-key" });
  const headers = (id, scope = "/") => ({
    "x-api-key": "synthetic-key",
    "x-obsidian-vault-id": id,
    "x-obsidian-scope": scope
  });
  return { runtime, roots, app, connect, headers };
}

test("official and LiveSync vaults keep identical note paths separate and require explicit selection", async (t) => {
  const { app, connect, headers } = fixture(t);
  const first = connect("Research", "official");
  const second = connect("Notes", "livesync");
  const inventory = await app.request("/vaults", { headers: { "x-api-key": "synthetic-key" } });
  assert.deepEqual(
    (await inventory.json()).vaults.map((vault) => vault.name),
    ["Research", "Notes"]
  );
  assert.equal((await app.request("/files/Proof.md", { headers: { "x-api-key": "synthetic-key" } })).status, 400);
  assert.equal((await app.request("/files/Proof.md", { headers: headers("missing") })).status, 404);
  assert.equal((await app.request("/vaults")).status, 401);
  for (const [connection, content] of [
    [first, "First vault"],
    [second, "Second vault"]
  ]) {
    const write = await app.request("/files/Proof.md", {
      method: "PUT",
      headers: { ...headers(connection.vault.id), "content-type": "application/json" },
      body: JSON.stringify({ content })
    });
    assert.equal(write.status, 201);
    const read = await app.request("/files/Proof.md", { headers: headers(connection.vault.id) });
    assert.equal((await read.json()).content, content);
    assert.equal(fs.readFileSync(path.join(connection.paths.vault, "Proof.md"), "utf8"), content);
  }
  const escape = await app.request("/files/%2e%2e%2f" + second.vault.id + "%2fProof.md", {
    headers: headers(first.vault.id)
  });
  assert.equal(escape.status, 400);
  fs.symlinkSync(second.paths.vault, path.join(first.paths.vault, "Neighbour"));
  assert.equal((await app.request("/files/Neighbour/Proof.md", { headers: headers(first.vault.id) })).status, 400);
  const listing = await app.request("/files", { headers: headers(first.vault.id) });
  assert.deepEqual((await listing.json()).files, ["Proof.md"]);
});

test("revoked, mismatched and damaged connections fail closed without disabling other vaults", async (t) => {
  const { runtime, app, connect, headers } = fixture(t);
  const first = connect("Research", "official", "Research");
  const second = connect("Notes", "livesync");
  assert.equal((await app.request("/files/Proof.md", { headers: headers(first.vault.id) })).status, 409);
  const enrollment = path.join(first.paths.runtime, "enrollment.json");
  fs.writeFileSync(enrollment, "malformed");
  assert.deepEqual(
    availableVaults({ runtime }).map((vault) => vault.id),
    [second.vault.id]
  );
  assert.equal((await app.request("/files/Proof.md", { headers: headers(first.vault.id, "Research") })).status, 404);
  const registry = readRegistry(runtime);
  registry.vaults.find((vault) => vault.id === second.vault.id).aiEnabled = false;
  fs.writeFileSync(path.join(runtime, "vaults.json"), JSON.stringify(registry));
  assert.equal((await app.request("/files/Proof.md", { headers: headers(second.vault.id) })).status, 404);
});

test("registry adoption preserves legacy storage and refuses corrupt state, stale additions and aliases", (t) => {
  const { runtime, roots, connect } = fixture(t);
  const first = connect("Research", "official");
  assert.throws(() => addVault(runtime, 1, { label: "Other", source: "official" }), /changed/);
  assert.throws(
    () => addVault(runtime, readRegistry(runtime).revision, { label: "research", source: "livesync" }),
    /distinct/
  );
  const registry = readRegistry(runtime);
  registry.vaults.push({ ...first.vault, id: "../escape" });
  fs.writeFileSync(path.join(runtime, "vaults.json"), JSON.stringify(registry));
  assert.throws(() => initializeRegistry({ runtime }), /invalid/);
  fs.writeFileSync(path.join(runtime, "vaults.json"), "null");
  assert.throws(() => initializeRegistry({ runtime }), /recovery/);
  assert.equal(fs.readFileSync(path.join(runtime, "vaults.json"), "utf8"), "null");
  fs.rmSync(path.join(runtime, "vaults.json"));
  const adopted = initializeRegistry({ runtime, legacySource: "official" });
  assert.equal(vaultPaths(adopted.vaults[0], roots).vault, roots.legacyVault);
  assert.deepEqual(readRegistry(runtime), adopted);
});

test("the private API enforces the saved scope as well as explicit vault identity", async (t) => {
  const { app, connect, headers } = fixture(t);
  const selected = connect("Research", "official", "Research");
  fs.mkdirSync(path.join(selected.paths.vault, "Research"));
  fs.mkdirSync(path.join(selected.paths.vault, "Private"));
  fs.writeFileSync(path.join(selected.paths.vault, "Research/Allowed.md"), "allowed");
  fs.writeFileSync(path.join(selected.paths.vault, "Private/Outside.md"), "private synthetic");
  const selectedHeaders = headers(selected.vault.id, "Research");
  const listing = await app.request("/files", { headers: selectedHeaders });
  assert.deepEqual((await listing.json()).files, ["Research/Allowed.md"]);
  const forbidden = await app.request("/files/Private/Outside.md", { headers: selectedHeaders });
  assert.equal(forbidden.status, 400);
  const write = await app.request("/files/Private/Outside.md", {
    method: "PUT",
    headers: { ...selectedHeaders, "content-type": "application/json" },
    body: JSON.stringify({ content: "changed" })
  });
  assert.equal(write.status, 400);
  assert.equal(fs.readFileSync(path.join(selected.paths.vault, "Private/Outside.md"), "utf8"), "private synthetic");
});
