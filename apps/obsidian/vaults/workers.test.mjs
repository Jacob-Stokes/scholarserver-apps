import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { addVault, initializeRegistry } from "./registry.mjs";
import { confirmedControllerRejection, VaultWorkers } from "./workers.mjs";

function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "obsidian-workers-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const roots = Object.fromEntries(
    ["runtime", "home", "vaults", "legacyVault", "liveSync", "database"].map((name) => [
      name,
      path.join(directory, name)
    ])
  );
  initializeRegistry({ runtime: roots.runtime, legacyVault: roots.legacyVault });
  const one = addVault(roots.runtime, 1, { label: "One", source: "official" }, "one");
  const two = addVault(roots.runtime, 2, { label: "Two", source: "livesync" }, "two");
  const spawned = [];
  const workers = new VaultWorkers({
    runtime: roots.runtime,
    roots,
    spawnWorker: (_binary, _args, options) => {
      const child = new EventEmitter();
      child.kill = () => child.emit("exit", 0);
      spawned.push({ child, options });
      return child;
    }
  });
  return { roots, workers, spawned, one, two };
}

test("a failed controller restarts only its own connection; other workers retain their process and home", async (t) => {
  const f = fixture(t);
  f.workers.reconcile();
  assert.equal(f.spawned.length, 2);
  assert.notEqual(f.spawned[0].options.env.OBSIDIAN_HOME_PATH, f.spawned[1].options.env.OBSIDIAN_HOME_PATH);
  const other = f.workers.workers.get("two").child;
  f.spawned[0].child.emit("exit", 1);
  await assert.rejects(f.workers.request("one", "/health"), /unavailable/);
  f.workers.reconcile();
  assert.equal(f.spawned.length, 2, "restart is bounded by the retry deadline");
  f.workers.workers.get("one").retryAfter = 0;
  f.workers.reconcile();
  assert.equal(f.spawned.length, 3);
  assert.equal(f.workers.workers.get("two").child, other);
  await f.workers.stop();
});

test("a symlinked vault directory is isolated without starting that vault or blocking another", async (t) => {
  const f = fixture(t);
  fs.mkdirSync(f.roots.vaults);
  fs.mkdirSync(f.roots.legacyVault);
  fs.symlinkSync(f.roots.legacyVault, path.join(f.roots.vaults, "one"));
  f.workers.reconcile();
  assert.equal(f.spawned.length, 1);
  assert.equal(f.workers.workers.get("one").child, null);
  assert.ok(f.workers.workers.get("two").child);
  assert.deepEqual(fs.readdirSync(f.roots.legacyVault), []);
  await f.workers.stop();
});

test("unknown existing legacy data is never initialized as an empty registry", (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "obsidian-adoption-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const runtime = path.join(directory, "runtime");
  const legacyVault = path.join(directory, "vault");
  fs.mkdirSync(legacyVault);
  fs.writeFileSync(path.join(legacyVault, "Preserve.md"), "synthetic");
  assert.throws(() => initializeRegistry({ runtime, legacyVault }), /identified sync method/);
  assert.equal(fs.existsSync(path.join(runtime, "vaults.json")), false);
  assert.equal(fs.readFileSync(path.join(legacyVault, "Preserve.md"), "utf8"), "synthetic");
});

test("only a matching pre-change rejection unlocks a forwarded configuration request", () => {
  const expected = { requestId: "test-request-identity", actionId: "save-scope" };
  const rejected = { ...expected, status: "rejected-before-change" };
  assert.equal(confirmedControllerRejection(rejected, 400, expected).status, "rejected");
  assert.equal(confirmedControllerRejection(rejected, 503, expected), null);
  assert.equal(confirmedControllerRejection({ ...rejected, actionId: "connect-vault" }, 400, expected), null);
  assert.equal(
    confirmedControllerRejection({ ...rejected, requestId: "another-request-identity" }, 400, expected),
    null
  );
  assert.equal(confirmedControllerRejection({ ...rejected, error: "untrusted details" }, 400, expected), null);
  assert.equal(confirmedControllerRejection({ ...expected, status: "unconfirmed" }, 400, expected), null);
  assert.equal(confirmedControllerRejection(rejected, 400, null), null);
});

test("reconciliation cannot restart vault processes after supervisor shutdown begins", async (t) => {
  const f = fixture(t);
  f.workers.reconcile();
  await f.workers.stop();
  for (const worker of f.workers.workers.values()) worker.retryAfter = 0;
  f.workers.reconcile();
  assert.equal(f.spawned.length, 2, "A late reconciliation must not reopen the stopped supervisor");
  assert.ok([...f.workers.workers.values()].every((worker) => worker.child === null));
});
