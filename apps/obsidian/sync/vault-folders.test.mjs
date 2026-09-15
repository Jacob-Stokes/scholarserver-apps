import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { browseVaultFolders } from "./vault-folders.mjs";

const linuxOnly = { skip: process.platform !== "linux" };

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "obsidian-folders-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const vault = path.join(root, "vault");
  const outside = path.join(root, "outside");
  await fs.mkdir(vault);
  await fs.mkdir(outside);
  await fs.mkdir(path.join(outside, "Private"));
  return { root, vault, outside };
}

test("folder browsing rejects unsafe paths and unknown inputs before filesystem access", async () => {
  for (const value of [
    "/",
    "/tmp",
    "..",
    "A/../B",
    ".obsidian",
    "A/.hidden",
    "A//B",
    "A/",
    "A\\B",
    "A\0B",
    "A\nB",
    "A\x7fB",
    "x".repeat(201),
    null,
    1
  ]) {
    await assert.rejects(browseVaultFolders("/unused", { path: value }), /relative vault folder/);
  }
  for (const input of [null, [], "", { path: "", root: "/tmp" }]) {
    await assert.rejects(browseVaultFolders("/unused", input), /Supply only/);
  }
});

test(
  "root and nested listings return only visible directories and relative parent paths without writes",
  linuxOnly,
  async (t) => {
    const { vault, outside } = await fixture(t);
    for (const folder of ["Reading/Papers", "Reports", ".obsidian", "Bad\\Name"]) {
      await fs.mkdir(path.join(vault, folder), { recursive: true });
    }
    await fs.writeFile(path.join(vault, "private-note.md"), "Never return note contents");
    await fs.symlink(outside, path.join(vault, "Linked"));
    const before = (await fs.stat(vault)).mtimeMs;
    assert.deepEqual(await browseVaultFolders(vault), {
      path: "",
      parent: null,
      folders: [
        { name: "Reading", path: "Reading" },
        { name: "Reports", path: "Reports" }
      ]
    });
    assert.deepEqual(await browseVaultFolders(vault, { path: "Reading" }), {
      path: "Reading",
      parent: "",
      folders: [{ name: "Papers", path: "Reading/Papers" }]
    });
    assert.deepEqual(await browseVaultFolders(vault, { path: "Reading/Papers" }), {
      path: "Reading/Papers",
      parent: "Reading",
      folders: []
    });
    assert.equal((await fs.stat(vault)).mtimeMs, before);
    assert.equal(await fs.readFile(path.join(vault, "private-note.md"), "utf8"), "Never return note contents");
  }
);

test(
  "missing folders, files and symlinks at any component fail without exposing server paths",
  linuxOnly,
  async (t) => {
    const { root, vault, outside } = await fixture(t);
    await fs.mkdir(path.join(vault, "Reading"));
    await fs.writeFile(path.join(vault, "note.md"), "private");
    await fs.symlink(outside, path.join(vault, "Escape"));
    await fs.symlink(outside, path.join(vault, "Reading", "Escape"));
    await fs.symlink(vault, path.join(root, "linked-root"));
    for (const relativePath of ["Missing", "note.md", "Escape", "Escape/Private", "Reading/Escape/Private"]) {
      await assert.rejects(browseVaultFolders(vault, { path: relativePath }), (error) => {
        assert.match(error.message, /Could not browse/);
        assert.equal(error.message.includes(root), false);
        return true;
      });
    }
    await assert.rejects(browseVaultFolders(path.join(root, "linked-root")), /Could not browse/);
  }
);

test("entry and folder bounds reject incomplete listings and permit subsequent reads", linuxOnly, async (t) => {
  const { vault } = await fixture(t);
  for (let index = 0; index < 250; index += 1) await fs.mkdir(path.join(vault, `Folder-${index}`));
  assert.equal((await browseVaultFolders(vault)).folders.length, 250);
  await fs.mkdir(path.join(vault, "One-too-many"));
  await assert.rejects(browseVaultFolders(vault), /maximum 250/);
  await fs.rm(path.join(vault, "One-too-many"), { recursive: true });
  assert.equal((await browseVaultFolders(vault)).folders.length, 250);

  const files = path.join(vault, "Folder-0");
  for (let index = 0; index < 2000; index += 1) await fs.writeFile(path.join(files, `.entry-${index}`), "");
  assert.deepEqual((await browseVaultFolders(vault, { path: "Folder-0" })).folders, []);
  await fs.writeFile(path.join(files, ".one-too-many"), "");
  await assert.rejects(browseVaultFolders(vault, { path: "Folder-0" }), /maximum 2000/);
});

test("a symlink substituted before traversal is rejected", linuxOnly, async (t) => {
  const { vault, outside } = await fixture(t);
  await fs.mkdir(path.join(vault, "Reading"));
  const originalOpen = fs.open;
  let calls = 0;
  t.mock.method(fs, "open", async (...args) => {
    calls += 1;
    if (calls === 2) {
      await fs.rename(path.join(vault, "Reading"), path.join(vault, "Previous"));
      await fs.symlink(outside, path.join(vault, "Reading"));
    }
    return originalOpen(...args);
  });
  await assert.rejects(browseVaultFolders(vault, { path: "Reading/Private" }), /Could not browse/);
});

test("a symlink substituted after traversal cannot redirect enumeration", linuxOnly, async (t) => {
  const { vault, outside } = await fixture(t);
  await fs.mkdir(path.join(vault, "Reading", "Papers"), { recursive: true });
  const originalOpendir = fs.opendir;
  t.mock.method(fs, "opendir", async (...args) => {
    await fs.rename(path.join(vault, "Reading"), path.join(vault, "Previous"));
    await fs.symlink(outside, path.join(vault, "Reading"));
    return originalOpendir(...args);
  });
  const result = await browseVaultFolders(vault, { path: "Reading" });
  assert.deepEqual(result.folders, [{ name: "Papers", path: "Reading/Papers" }]);
});

test("the sync image includes the folder reader and the action stays on the existing protected mailbox", async () => {
  const controller = await fs.readFile(new URL("./controller.mjs", import.meta.url), "utf8");
  const dockerfile = await fs.readFile(new URL("./Dockerfile", import.meta.url), "utf8");
  assert.match(controller, /case "browse-folders":\s+if \(state.state !== "ready"\)/);
  assert.match(controller, /return browseVaultFolders\(vaultPath, request.input \?\? \{\}\)/);
  assert.match(controller, /if \(request\?\.action !== "browse-folders"\)/);
  assert.doesNotMatch(controller, /"\/api\/[^"\n]+": "browse-folders"/);
  assert.match(dockerfile, /COPY[^\n]+sync\/vault-folders\.mjs \/app\/vault-folders\.mjs/);
});
