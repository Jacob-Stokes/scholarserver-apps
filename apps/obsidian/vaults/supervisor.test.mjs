import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { readRegistry, vaultPaths } from "./registry.mjs";

async function freePort() {
  const server = net.createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function until(read, accept) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const result = await read();
      if (accept(result)) return result;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("The isolated controller did not reach the expected state.");
}

test("two official vault controllers share the installation, keep separate sign-in directories and survive a supervisor restart", async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "obsidian-supervisor-"));
  const roots = Object.fromEntries(
    ["runtime", "liveSync", "database", "home", "vaults", "legacyVault"].map((name) => [
      name,
      path.join(directory, name)
    ])
  );
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  let child;
  let diagnostic = "";
  async function stop() {
    if (!child || child.exitCode !== null) return;
    const exiting = once(child, "exit");
    child.kill("SIGTERM");
    const deadline = setTimeout(() => child.kill("SIGKILL"), 12_000);
    await exiting;
    clearTimeout(deadline);
  }
  t.after(async () => {
    await stop();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  async function start() {
    child = spawn(process.execPath, [fileURLToPath(new URL("../sync/supervisor.mjs", import.meta.url))], {
      env: {
        ...process.env,
        SCHOLARSERVER_VARIANT: "",
        OBSIDIAN_SUPERVISOR_PORT: String(port),
        OBSIDIAN_CONTROLLER_PORT_BASE: "41920",
        OBSIDIAN_RUNTIME_PATH: roots.runtime,
        OBSIDIAN_SHARED_LIVESYNC_PATH: roots.liveSync,
        OBSIDIAN_HOME_ROOT: roots.home,
        OBSIDIAN_VAULTS_PATH: roots.vaults,
        OBSIDIAN_DATABASE_ROOT: roots.database,
        OBSIDIAN_LEGACY_VAULT_PATH: roots.legacyVault
      },
      stdio: ["ignore", "ignore", "pipe"]
    });
    child.stderr.on("data", (bytes) => {
      diagnostic += bytes.toString();
    });
    await until(
      () => fetch(`${base}/health`).then((response) => response.json()),
      (result) => result.status === "ok"
    );
  }
  async function section(id = "vaults") {
    return fetch(`${base}/api/configuration/${id}`).then((response) => response.json());
  }
  async function add(label) {
    const saved = await section();
    const requestId = randomUUID();
    const body = { requestId, expectedRevision: saved.revision, values: { label, source: "official" } };
    const result = await fetch(`${base}/api/configuration/vaults/actions/add-vault`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    }).then((response) => response.json());
    return { body, result };
  }
  await start();
  const first = await add("Research");
  assert.equal(first.result.status, "succeeded", diagnostic);
  const replay = await fetch(`${base}/api/configuration/vaults/actions/add-vault`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(first.body)
  }).then((response) => response.json());
  assert.equal(replay.status, "succeeded");
  await add("Notes");
  const registry = readRegistry(roots.runtime);
  assert.equal(registry.vaults.length, 2);
  const paths = registry.vaults.map((vault) => vaultPaths(vault, roots));
  assert.notEqual(paths[0].home, paths[1].home);
  assert.notEqual(paths[0].vault, paths[1].vault);
  await until(
    () => section("setup"),
    (result) => result.fields?.some((field) => field.id === "vaultId")
  );
  const evaluated = await fetch(`${base}/api/configuration/setup/evaluate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ values: { vaultId: registry.vaults[1].id } })
  }).then((response) => response.json());
  assert.equal(evaluated.values.vaultId, registry.vaults[1].id);
  assert.equal(evaluated.fields.find((field) => field.id === "vaultId").selectsContext, true);
  const awaitingConsent = await until(
    () => section("setup"),
    (result) => result.stage?.id === "client"
  );
  const rejectedRequest = {
    requestId: randomUUID(),
    expectedRevision: awaitingConsent.revision,
    values: { vaultId: registry.vaults[0].id, confirmed: false }
  };
  const rejected = await fetch(`${base}/api/configuration/setup/actions/install-client`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(rejectedRequest)
  }).then((response) => response.json());
  assert.equal(rejected.status, "rejected", "a proven child pre-change refusal must not leave the form locked");
  const rejectionReceipt = await fetch(`${base}/api/configuration/setup/operations/${rejectedRequest.requestId}`).then(
    (response) => response.json()
  );
  assert.deepEqual(rejectionReceipt, rejected);
  const duplicate = await add("research");
  assert.equal(duplicate.result.status, "rejected-before-change");
  assert.equal(readRegistry(roots.runtime).vaults.length, 2);
  const access = await fetch(`${base}/api/configuration/access/evaluate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ values: { vaultId: registry.vaults[1].id } })
  }).then((response) => response.json());
  assert.equal(access.values.aiEnabled, true);
  const accessRequest = {
    requestId: randomUUID(),
    expectedRevision: access.revision,
    values: { vaultId: registry.vaults[1].id, label: "Notes", aiEnabled: false }
  };
  const accessResult = await fetch(`${base}/api/configuration/access/actions/save-access`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(accessRequest)
  }).then((response) => response.json());
  assert.equal(accessResult.status, "succeeded");
  const afterAccess = readRegistry(roots.runtime);
  assert.equal(afterAccess.vaults[1].aiEnabled, false);
  assert.equal(afterAccess.vaults[0].aiEnabled, true);
  const accessReceipt = await fetch(`${base}/api/configuration/access/operations/${accessRequest.requestId}`).then(
    (response) => response.json()
  );
  assert.equal(accessReceipt.status, "succeeded");
  const wrongSection = await fetch(`${base}/api/configuration/setup/operations/${accessRequest.requestId}`);
  assert.equal(wrongSection.status, 404);
  const token = fs.readFileSync(path.join(roots.runtime, "service-token"), "utf8");
  await stop();
  await start();
  await until(
    () => section("setup"),
    (result) => result.fields?.some((field) => field.id === "vaultId")
  );
  const persistedRejection = await fetch(
    `${base}/api/configuration/setup/operations/${rejectedRequest.requestId}`
  ).then((response) => response.json());
  assert.deepEqual(
    persistedRejection,
    rejected,
    "restart must preserve the proven refusal without replaying the install"
  );
  assert.deepEqual(readRegistry(roots.runtime), afterAccess);
  assert.equal(fs.readFileSync(path.join(roots.runtime, "service-token"), "utf8"), token);
  assert.equal(diagnostic, "");
});
