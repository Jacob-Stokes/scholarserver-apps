import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createVaultBinding } from "./vault-binding.mjs";

const official = { profile: "official", vaultId: "synthetic-official-vault" };
const livesync = { profile: "livesync", vaultId: "synthetic-livesync-database" };
const recovery = /recover/i;
const denied = /recover|already assigned|separate Obsidian installation/i;

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "obsidian-vault-binding-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const paths = {
    runtimePath: path.join(root, "runtime"),
    liveSyncRuntimePath: path.join(root, "livesync-runtime"),
    vaultPath: path.join(root, "vault")
  };
  for (const directory of Object.values(paths)) await fs.mkdir(directory);
  return {
    root,
    ...paths,
    enrollmentPath: path.join(paths.runtimePath, "enrollment.json"),
    bindingPath: path.join(paths.runtimePath, "vault-binding.json"),
    restart: () => createVaultBinding(paths)
  };
}

function enrollmentFor(target) {
  if (target.profile === "livesync") {
    return { profile: "livesync", database: target.vaultId, scopePath: "/Research" };
  }
  return { profile: "official", remoteVault: target.vaultId, mode: "bidirectional", scopePath: "/Research" };
}

async function writeJson(file, value) {
  await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
}

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, "utf8"));
}

async function fileSnapshot(file) {
  const info = await fs.stat(file);
  return { bytes: await fs.readFile(file), mode: info.mode, inode: info.ino, modified: info.mtimeMs };
}

async function assertMissing(file) {
  await assert.rejects(fs.lstat(file), { code: "ENOENT" });
}

async function assertDenied(operation, state, pattern = denied) {
  await assert.rejects(operation, (error) => {
    assert.match(error.message, pattern);
    for (const privateValue of [state.root, official.vaultId, livesync.vaultId, "synthetic-replacement-vault"]) {
      assert.equal(error.message.includes(privateValue), false, "errors must not disclose vault IDs or fixture paths");
    }
    return true;
  });
}

test("an empty installation restores without creating enrollment or a binding", async (t) => {
  const state = await fixture(t);
  assert.equal(await state.restart().restore(), null);
  assert.equal(await state.restart().restore(), null);
  await assertDenied(() => state.restart().assertCurrent(), state, recovery);
  for (const directory of [state.runtimePath, state.liveSyncRuntimePath, state.vaultPath]) {
    assert.deepEqual(await fs.readdir(directory), []);
  }
});

for (const target of [official, livesync]) {
  test(`a fresh ${target.profile} claim persists a private binding before enrollment`, async (t) => {
    const state = await fixture(t);
    await state.restart().begin(target);
    assert.deepEqual(await readJson(state.bindingPath), { version: 1, ...target });
    assert.equal((await fs.stat(state.bindingPath)).mode & 0o777, 0o600);
    await assertMissing(state.enrollmentPath);
    await assertDenied(() => state.restart().assertCurrent(), state, recovery);

    const marker = await fileSnapshot(state.bindingPath);
    const enrollment = enrollmentFor(target);
    await writeJson(state.enrollmentPath, enrollment);
    assert.deepEqual(await state.restart().restore(), enrollment);
    await state.restart().assertCurrent();
    assert.deepEqual(await fileSnapshot(state.bindingPath), marker);
  });
}

const savedEnrollments = [
  { name: "official", target: official, enrollment: enrollmentFor(official) },
  {
    name: "legacy official without a profile",
    target: official,
    enrollment: { remoteVault: official.vaultId, mode: "bidirectional", scopePath: "/Research" }
  },
  { name: "LiveSync", target: livesync, enrollment: enrollmentFor(livesync) }
];

for (const { name, target, enrollment } of savedEnrollments) {
  test(`${name} restart adoption preserves enrollment, grants, credentials and replica data`, async (t) => {
    const state = await fixture(t);
    await writeJson(state.enrollmentPath, enrollment);
    const preservedFiles = [
      [path.join(state.runtimePath, "grants.json"), '{"browse-folders":false,"create-research-note":true}\n'],
      [path.join(state.runtimePath, "service-token"), "synthetic-service-token\n"],
      [path.join(state.runtimePath, "scope-path"), "/Research\n"],
      [path.join(state.vaultPath, "existing-note.md"), "Synthetic note content\n"],
      [path.join(state.liveSyncRuntimePath, "livesync-worker.json"), '{"enabled":false,"revision":7}\n'],
      [path.join(state.liveSyncRuntimePath, "livesync-onboarding.json"), '{"setupPassphrase":"synthetic-secret"}\n']
    ];
    for (const [file, contents] of preservedFiles) await fs.writeFile(file, contents, { mode: 0o600 });
    const files = [state.enrollmentPath, ...preservedFiles.map(([file]) => file)];
    const before = await Promise.all(files.map(fileSnapshot));
    const runtimeEntries = (await fs.readdir(state.runtimePath)).sort();

    await assertDenied(() => state.restart().assertCurrent(), state, recovery);
    await assertMissing(state.bindingPath);
    assert.deepEqual(await state.restart().restore(), enrollment);
    assert.deepEqual(await readJson(state.bindingPath), { version: 1, ...target });
    assert.equal((await fs.stat(state.bindingPath)).mode & 0o777, 0o600);
    const marker = await fileSnapshot(state.bindingPath);

    assert.deepEqual(await state.restart().restore(), enrollment);
    await state.restart().assertCurrent();
    await assertDenied(() => state.restart().begin(target), state);
    await assertDenied(() => state.restart().begin({ ...target, vaultId: "synthetic-replacement-vault" }), state);
    assert.deepEqual(await fileSnapshot(state.bindingPath), marker);
    assert.deepEqual(await Promise.all(files.map(fileSnapshot)), before);
    assert.deepEqual((await fs.readdir(state.runtimePath)).sort(), [...runtimeEntries, "vault-binding.json"].sort());
  });
}

test("begin rejects an existing legacy enrollment without silently adopting or rerunning setup", async (t) => {
  const state = await fixture(t);
  await writeJson(state.enrollmentPath, { remoteVault: official.vaultId });
  const enrollment = await fileSnapshot(state.enrollmentPath);
  for (const target of [official, livesync]) await assertDenied(() => state.restart().begin(target), state);
  await assertMissing(state.bindingPath);
  assert.deepEqual(await fileSnapshot(state.enrollmentPath), enrollment);
});

test("a pending official pull can retry only its original target after restart, preserving partial data", async (t) => {
  const state = await fixture(t);
  await state.restart().begin(official);
  const marker = await fileSnapshot(state.bindingPath);
  const partialNote = path.join(state.vaultPath, "partial-pull.md");
  await fs.writeFile(partialNote, "Synthetic downloaded data\n");
  const partial = await fileSnapshot(partialNote);

  for (let restart = 0; restart < 2; restart += 1) {
    const binding = state.restart();
    assert.equal(await binding.restore(), null);
    await binding.begin(official);
    await assertDenied(() => binding.assertCurrent(), state, recovery);
    await assertDenied(() => binding.begin({ ...official, vaultId: "synthetic-replacement-vault" }), state);
    await assertDenied(() => binding.begin({ profile: "livesync", vaultId: official.vaultId }), state);
  }
  assert.deepEqual(await fileSnapshot(state.bindingPath), marker);
  assert.deepEqual(await fileSnapshot(partialNote), partial);
  await assertMissing(state.enrollmentPath);
});

test("pending LiveSync never replays uncertain provisioning, even for the same database", async (t) => {
  const state = await fixture(t);
  await state.restart().begin(livesync);
  const marker = await fileSnapshot(state.bindingPath);
  for (let restart = 0; restart < 2; restart += 1) {
    const binding = state.restart();
    await assertDenied(() => binding.restore(), state, recovery);
    await assertDenied(() => binding.begin(livesync), state);
    await assertDenied(() => binding.begin({ ...livesync, vaultId: "synthetic-replacement-vault" }), state);
    await assertDenied(() => binding.begin({ profile: "official", vaultId: livesync.vaultId }), state);
    await assertDenied(() => binding.assertCurrent(), state, recovery);
  }
  assert.deepEqual(await fileSnapshot(state.bindingPath), marker);
  await assertMissing(state.enrollmentPath);
});

for (const target of [official, livesync]) {
  test(`replacing ${target.profile} enrollment cannot change the bound vault or profile`, async (t) => {
    const state = await fixture(t);
    await writeJson(state.enrollmentPath, enrollmentFor(target));
    const binding = state.restart();
    await binding.restore();
    const marker = await fileSnapshot(state.bindingPath);
    const otherProfile = target.profile === "official" ? "livesync" : "official";
    for (const replacement of [
      { ...target, vaultId: "synthetic-replacement-vault" },
      { profile: otherProfile, vaultId: target.vaultId }
    ]) {
      const staged = path.join(state.runtimePath, "replacement.json");
      await writeJson(staged, enrollmentFor(replacement));
      await fs.rename(staged, state.enrollmentPath);
      const replaced = await fileSnapshot(state.enrollmentPath);
      await assertDenied(() => binding.assertCurrent(), state, recovery);
      await assertDenied(() => state.restart().assertCurrent(), state, recovery);
      await assertDenied(() => state.restart().restore(), state, recovery);
      await assertDenied(() => state.restart().begin(replacement), state);
      assert.deepEqual(await fileSnapshot(state.enrollmentPath), replaced);
      assert.deepEqual(await fileSnapshot(state.bindingPath), marker);
    }
  });

  test(`deleting ${target.profile} enrollment cannot release its binding for another vault`, async (t) => {
    const state = await fixture(t);
    await writeJson(state.enrollmentPath, enrollmentFor(target));
    const binding = state.restart();
    await binding.restore();
    const marker = await fileSnapshot(state.bindingPath);
    await fs.unlink(state.enrollmentPath);
    await assertDenied(() => binding.assertCurrent(), state, recovery);
    await assertDenied(() => state.restart().assertCurrent(), state, recovery);
    await assertDenied(() => state.restart().begin({ ...target, vaultId: "synthetic-replacement-vault" }), state);
    if (target.profile === "official") {
      assert.equal(await state.restart().restore(), null);
      await state.restart().begin(target);
    } else {
      await assertDenied(() => state.restart().restore(), state, recovery);
      await assertDenied(() => state.restart().begin(target), state);
    }
    assert.deepEqual(await fileSnapshot(state.bindingPath), marker);
    await assertMissing(state.enrollmentPath);
  });
}

test("assertCurrent rereads the marker and cannot adopt one deleted after successful restore", async (t) => {
  const state = await fixture(t);
  await writeJson(state.enrollmentPath, enrollmentFor(official));
  const binding = state.restart();
  await binding.restore();
  await fs.unlink(state.bindingPath);
  await assertDenied(() => binding.assertCurrent(), state, recovery);
  await assertDenied(() => state.restart().assertCurrent(), state, recovery);
  await assertMissing(state.bindingPath);
  assert.deepEqual(await binding.restore(), enrollmentFor(official));
  await binding.assertCurrent();
});

const malformedEnrollments = [
  ["invalid JSON", "{"],
  ["empty file", ""],
  ["null record", "null"],
  ["array", "[]"],
  ["scalar", '"synthetic-official-vault"'],
  ["missing identity", "{}"],
  ["null profile is not an omitted legacy profile", JSON.stringify({ profile: null, remoteVault: official.vaultId })],
  ["unsupported profile", JSON.stringify({ profile: "other", remoteVault: official.vaultId })],
  ["empty official identity", JSON.stringify({ profile: "official", remoteVault: "" })],
  ["non-string official identity", JSON.stringify({ remoteVault: 7 })],
  ["official cannot use a database instead", JSON.stringify({ profile: "official", database: official.vaultId })],
  [
    "LiveSync cannot use a remote vault instead",
    JSON.stringify({ profile: "livesync", remoteVault: livesync.vaultId })
  ],
  ["empty database", JSON.stringify({ profile: "livesync", database: "" })],
  ["non-string database", JSON.stringify({ profile: "livesync", database: {} })],
  ["control character in identity", JSON.stringify({ remoteVault: `${official.vaultId}\n` })]
];

test("malformed enrollment fails closed both before adoption and beside a pending binding", async (t) => {
  for (const [name, contents] of malformedEnrollments) {
    await t.test(name, async (t) => {
      const state = await fixture(t);
      await fs.writeFile(state.enrollmentPath, contents);
      const enrollment = await fileSnapshot(state.enrollmentPath);
      await assertDenied(() => state.restart().restore(), state, recovery);
      await assertDenied(() => state.restart().begin(official), state);
      await assertDenied(() => state.restart().assertCurrent(), state, recovery);
      await assertMissing(state.bindingPath);
      await writeJson(state.bindingPath, { version: 1, ...official });
      const marker = await fileSnapshot(state.bindingPath);
      await assertDenied(() => state.restart().restore(), state, recovery);
      await assertDenied(() => state.restart().begin(official), state);
      await assertDenied(() => state.restart().assertCurrent(), state, recovery);
      assert.deepEqual(await fileSnapshot(state.bindingPath), marker);
      assert.deepEqual(await fileSnapshot(state.enrollmentPath), enrollment);
    });
  }
});

const malformedBindings = [
  ["invalid JSON", "{"],
  ["empty file", ""],
  ["null record", "null"],
  ["array", "[]"],
  ["scalar", "1"],
  ["missing fields", "{}"],
  ["unsupported version", JSON.stringify({ version: 2, ...official })],
  ["string version", JSON.stringify({ version: "1", ...official })],
  ["extra property", JSON.stringify({ version: 1, ...official, grant: true })],
  ["missing profile", JSON.stringify({ version: 1, vaultId: official.vaultId })],
  ["unsupported profile", JSON.stringify({ version: 1, profile: "other", vaultId: official.vaultId })],
  ["empty identity", JSON.stringify({ version: 1, profile: "official", vaultId: "" })],
  ["non-string identity", JSON.stringify({ version: 1, profile: "official", vaultId: [] })],
  ["control character", JSON.stringify({ version: 1, profile: "official", vaultId: `${official.vaultId}\0` })]
];

test("malformed markers are preserved, never replaced or adopted from enrollment", async (t) => {
  for (const [name, contents] of malformedBindings) {
    await t.test(name, async (t) => {
      const state = await fixture(t);
      await fs.writeFile(state.bindingPath, contents);
      const marker = await fileSnapshot(state.bindingPath);
      await assertDenied(() => state.restart().restore(), state, recovery);
      await assertDenied(() => state.restart().begin(official), state);
      await assertDenied(() => state.restart().assertCurrent(), state, recovery);
      await assertMissing(state.enrollmentPath);
      await writeJson(state.enrollmentPath, enrollmentFor(official));
      await assertDenied(() => state.restart().restore(), state, recovery);
      await assertDenied(() => state.restart().assertCurrent(), state, recovery);
      assert.deepEqual(await fileSnapshot(state.bindingPath), marker);
    });
  }
});

test("nonempty unbound vaults require recovery, including hidden configuration alone", async (t) => {
  for (const entry of ["existing-note.md", ".obsidian"]) {
    await t.test(entry, async (t) => {
      const state = await fixture(t);
      const artifact = path.join(state.vaultPath, entry);
      if (entry === ".obsidian") await fs.mkdir(artifact);
      else await fs.writeFile(artifact, "Synthetic existing notes\n");
      await assertDenied(() => state.restart().restore(), state, recovery);
      for (const target of [official, livesync])
        await assertDenied(() => state.restart().begin(target), state, recovery);
      await assertMissing(state.bindingPath);
      await assertMissing(state.enrollmentPath);
      assert.deepEqual(await fs.readdir(state.vaultPath), [entry]);
      if (entry !== ".obsidian") assert.equal(await fs.readFile(artifact, "utf8"), "Synthetic existing notes\n");
    });
  }
});

const pristineWorkerStatus = {
  state: "waiting",
  running: false,
  activeRevision: null,
  lastError: null,
  lastStartedAt: null
};

test("a newly started waiting worker does not block first LiveSync setup", async (t) => {
  const state = await fixture(t);
  const statusPath = path.join(state.liveSyncRuntimePath, "livesync-worker-status.json");
  await writeJson(statusPath, pristineWorkerStatus);
  const before = await fileSnapshot(statusPath);
  assert.equal(await state.restart().restore(), null);
  await state.restart().begin(livesync);
  assert.deepEqual(await readJson(state.bindingPath), { version: 1, ...livesync });
  assert.deepEqual(await fileSnapshot(statusPath), before);
  await assertDenied(() => state.restart().restore(), state, recovery);
  await assertDenied(() => state.restart().begin(livesync), state);
});

test("waiting status with prior activity or incomplete fields is not pristine", async (t) => {
  for (const changed of [
    { state: "stopped" },
    { running: true },
    { activeRevision: 1 },
    { lastError: "Synthetic failure" },
    { lastStartedAt: "2026-09-17T12:00:00Z" },
    { activeRevision: undefined },
    { extra: true }
  ]) {
    const state = await fixture(t);
    await writeJson(path.join(state.liveSyncRuntimePath, "livesync-worker-status.json"), {
      ...pristineWorkerStatus,
      ...changed
    });
    await assertDenied(() => state.restart().restore(), state, recovery);
    await assertDenied(() => state.restart().begin(livesync), state, recovery);
    await assertMissing(state.bindingPath);
  }
});

test("pristine worker status cannot excuse orphaned configuration or a nonempty vault", async (t) => {
  for (const artifact of ["livesync-worker.json", "livesync-onboarding.json", "note.md"]) {
    const state = await fixture(t);
    await writeJson(path.join(state.liveSyncRuntimePath, "livesync-worker-status.json"), pristineWorkerStatus);
    const directory = artifact === "note.md" ? state.vaultPath : state.liveSyncRuntimePath;
    await writeJson(path.join(directory, artifact), { synthetic: true });
    await assertDenied(() => state.restart().restore(), state, recovery);
    await assertDenied(() => state.restart().begin(livesync), state, recovery);
    await assertMissing(state.bindingPath);
  }
});

test("orphaned LiveSync worker, onboarding and status artifacts block fresh claims", async (t) => {
  for (const name of ["livesync-worker.json", "livesync-onboarding.json", "livesync-worker-status.json"]) {
    await t.test(name, async (t) => {
      const state = await fixture(t);
      const artifact = path.join(state.liveSyncRuntimePath, name);
      await writeJson(artifact, { database: livesync.vaultId, enabled: false });
      const before = await fileSnapshot(artifact);
      await assertDenied(() => state.restart().restore(), state, recovery);
      for (const target of [official, livesync])
        await assertDenied(() => state.restart().begin(target), state, recovery);
      await assertMissing(state.bindingPath);
      await assertMissing(state.enrollmentPath);
      assert.deepEqual(await fileSnapshot(artifact), before);
    });
  }
});

test("symlinked and dangling enrollment or binding records are rejected without following them", async (t) => {
  for (const record of ["enrollmentPath", "bindingPath"]) {
    for (const dangling of [false, true]) {
      await t.test(`${record}, ${dangling ? "dangling" : "existing target"}`, async (t) => {
        const state = await fixture(t);
        const target = path.join(state.root, "symlink-target.json");
        let before;
        if (!dangling) {
          const contents = record === "enrollmentPath" ? enrollmentFor(official) : { version: 1, ...official };
          await writeJson(target, contents);
          before = await fileSnapshot(target);
        }
        await fs.symlink(target, state[record]);
        await assertDenied(() => state.restart().restore(), state, recovery);
        await assertDenied(() => state.restart().begin(official), state);
        await assertDenied(() => state.restart().assertCurrent(), state, recovery);
        assert.equal(await fs.readlink(state[record]), target);
        if (dangling) await assertMissing(target);
        else assert.deepEqual(await fileSnapshot(target), before);
        const otherRecord = record === "enrollmentPath" ? state.bindingPath : state.enrollmentPath;
        await assertMissing(otherRecord);
      });
    }
  }
});

test("LiveSync artifact symlinks cannot disguise a previous provisioning attempt", async (t) => {
  for (const name of ["livesync-worker.json", "livesync-onboarding.json", "livesync-worker-status.json"]) {
    const state = await fixture(t);
    const target = path.join(state.root, "missing-artifact.json");
    const link = path.join(state.liveSyncRuntimePath, name);
    await fs.symlink(target, link);
    await assertDenied(() => state.restart().restore(), state, recovery);
    await assertDenied(() => state.restart().begin(official), state, recovery);
    assert.equal(await fs.readlink(link), target);
    await assertMissing(target);
    await assertMissing(state.bindingPath);
  }
});

test("non-file records and ENOTDIR reads fail closed instead of looking like missing enrollment", async (t) => {
  for (const record of ["enrollmentPath", "bindingPath"]) {
    await t.test(`directory at ${record}`, async (t) => {
      const state = await fixture(t);
      await fs.mkdir(state[record]);
      await assertDenied(() => state.restart().restore(), state, recovery);
      await assertDenied(() => state.restart().begin(official), state);
      await assertDenied(() => state.restart().assertCurrent(), state, recovery);
      assert.equal((await fs.lstat(state[record])).isDirectory(), true);
    });
  }
  for (const directory of ["runtimePath", "liveSyncRuntimePath", "vaultPath"]) {
    await t.test(`file at ${directory}`, async (t) => {
      const state = await fixture(t);
      await fs.rmdir(state[directory]);
      await fs.writeFile(state[directory], "Synthetic obstructing file\n");
      const before = await fileSnapshot(state[directory]);
      await assertDenied(() => state.restart().restore(), state, recovery);
      await assertDenied(() => state.restart().begin(official), state, recovery);
      assert.deepEqual(await fileSnapshot(state[directory]), before);
    });
  }
});

test("unreadable saved records fail closed and keep their bytes and permissions", {
  skip: process.platform === "win32" || process.getuid?.() === 0
}, async (t) => {
  for (const record of ["enrollmentPath", "bindingPath"]) {
    await t.test(record, async (t) => {
      const state = await fixture(t);
      await writeJson(state.enrollmentPath, enrollmentFor(official));
      await writeJson(state.bindingPath, { version: 1, ...official });
      const before = await fs.readFile(state[record]);
      await fs.chmod(state[record], 0);
      try {
        await assert.rejects(fs.readFile(state[record]), { code: "EACCES" });
        await assertDenied(() => state.restart().restore(), state, recovery);
        await assertDenied(() => state.restart().begin(official), state);
        await assertDenied(() => state.restart().assertCurrent(), state, recovery);
        assert.equal((await fs.stat(state[record])).mode & 0o777, 0);
      } finally {
        await fs.chmod(state[record], 0o600);
      }
      assert.deepEqual(await fs.readFile(state[record]), before);
    });
  }
});

test("parallel initial claims publish exactly one target and the loser cannot overwrite it", async (t) => {
  for (const targets of [
    [official, { ...official, vaultId: "synthetic-replacement-vault" }],
    [official, livesync],
    [livesync, { ...livesync, vaultId: "synthetic-replacement-vault" }]
  ]) {
    const state = await fixture(t);
    const results = await Promise.allSettled(targets.map((target) => state.restart().begin(target)));
    assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
    assert.equal(results.filter((result) => result.status === "rejected").length, 1);
    const winner = results.findIndex((result) => result.status === "fulfilled");
    const loser = 1 - winner;
    assert.deepEqual(await readJson(state.bindingPath), { version: 1, ...targets[winner] });
    const marker = await fileSnapshot(state.bindingPath);
    await assertDenied(() => state.restart().begin(targets[loser]), state);
    await writeJson(state.enrollmentPath, enrollmentFor(targets[winner]));
    assert.deepEqual(await state.restart().restore(), enrollmentFor(targets[winner]));
    await state.restart().assertCurrent();
    assert.deepEqual(await fileSnapshot(state.bindingPath), marker);
    assert.deepEqual((await fs.readdir(state.runtimePath)).sort(), ["enrollment.json", "vault-binding.json"]);
  }
});

test("recovery diagnostics and logs omit synthetic IDs, credentials and filesystem locations", async (t) => {
  const state = await fixture(t);
  const messages = [];
  for (const method of ["log", "info", "warn", "error", "debug"]) {
    t.mock.method(console, method, (...args) => messages.push(args.map(String).join(" ")));
  }
  await writeJson(state.enrollmentPath, enrollmentFor(official));
  await state.restart().restore();
  await writeJson(state.enrollmentPath, {
    profile: "official",
    remoteVault: "synthetic-replacement-vault",
    secret: "synthetic-private-credential"
  });
  await assertDenied(() => state.restart().restore(), state, recovery);
  await assertDenied(() => state.restart().begin(livesync), state);
  await assertDenied(() => state.restart().assertCurrent(), state, recovery);
  const output = messages.join("\n");
  for (const privateValue of [
    state.root,
    official.vaultId,
    livesync.vaultId,
    "synthetic-replacement-vault",
    "synthetic-private-credential"
  ]) {
    assert.equal(output.includes(privateValue), false, "logs must not disclose connection details");
  }
});

test("the sync image copies vault binding and inventories its source for image drift checks", async () => {
  const dockerfile = await fs.readFile(new URL("./Dockerfile", import.meta.url), "utf8");
  const inventory = await readJson(new URL("../../../scripts/image-source-inventory.json", import.meta.url));
  assert.match(
    dockerfile,
    /^COPY[^\n]*apps\/obsidian\/sync\/vault-binding\.mjs[^\n]* \/app\/(?:vault-binding\.mjs)?\s*$/m
  );
  const recipes = inventory.recipes.filter((recipe) => recipe.name === "obsidian-sync");
  assert.equal(recipes.length, 1);
  assert.equal(recipes[0].dockerfile, "apps/obsidian/sync/Dockerfile");
  assert.ok(recipes[0].sourceInputs.includes("apps/obsidian/sync/vault-binding.mjs"));
});

function controllerFunction(source, name) {
  const declaration = source.match(new RegExp(`^async function ${name}\\([^\\n]*\\) \\{[\\s\\S]*?^\\}`, "m"));
  assert.ok(declaration, `expected controller function ${name}`);
  return declaration[0];
}

function assertBefore(source, prerequisite, operation) {
  const prerequisiteIndex = source.indexOf(prerequisite);
  const operationIndex = source.indexOf(operation);
  assert.ok(prerequisiteIndex >= 0, `missing prerequisite: ${prerequisite}`);
  assert.ok(operationIndex >= 0, `missing operation: ${operation}`);
  assert.ok(prerequisiteIndex < operationIndex, `${prerequisite} must precede ${operation}`);
}

test("controller source reserves the binding before stopping sync or provisioning either profile", async () => {
  const source = await fs.readFile(new URL("./controller.mjs", import.meta.url), "utf8");
  assert.match(source, /import \{ createVaultBinding \} from "\.\/vault-binding\.mjs"/);
  assert.match(source, /createVaultBinding\(\{ runtimePath, liveSyncRuntimePath, vaultPath \}\)/);
  const officialSetup = controllerFunction(source, "connectVault");
  const officialClaim = 'await vaultBinding.begin({ profile: "official", vaultId: input.vault })';
  for (const operation of ["await stopOfficialSync()", "await runOb(setup", "await atomicJson(enrollmentPath"]) {
    assertBefore(officialSetup, officialClaim, operation);
  }
  const liveSyncSetup = controllerFunction(source, "configureLiveSync");
  const liveSyncClaim = 'await vaultBinding.begin({ profile: "livesync", vaultId: database })';
  for (const operation of [
    "await ensureLiveSyncSecrets()",
    "await stopOfficialSync()",
    "await provisionCouchDb(",
    "await atomicJson(enrollmentPath"
  ]) {
    assertBefore(liveSyncSetup, liveSyncClaim, operation);
  }
});

test("controller source validates restored identity before resuming sync or exposing vault operations", async () => {
  const source = await fs.readFile(new URL("./controller.mjs", import.meta.url), "utf8");
  const restored = controllerFunction(source, "restore");
  assertBefore(restored, "enrollment = await vaultBinding.restore()", "await startContinuousSync()");
  assert.match(
    restored,
    /catch \(error\) \{\s+await updateStatus\(\{ state: "recovery-required", lastError: error.message \}\);\s+return;/
  );
  assert.doesNotMatch(restored, /readJson\(enrollmentPath/);

  const completion = controllerFunction(source, "completeLiveSync");
  assertBefore(completion, "await vaultBinding.assertCurrent()", "await atomicJson(liveSyncWorkerPath");
  const actions = controllerFunction(source, "action");
  for (const [action, operation] of [
    ["browse-folders", "browseVaultFolders"],
    ["create-research-note", "createResearchNote"]
  ]) {
    const branch = actions.match(new RegExp(`case "${action}":[\\s\\S]*?(?=case |$)`));
    assert.ok(branch, `expected protected action ${action}`);
    assertBefore(branch[0], "await vaultBinding.assertCurrent()", `return ${operation}(`);
  }
});
