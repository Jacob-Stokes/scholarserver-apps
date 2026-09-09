import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm, symlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createResearchNote } from "./research-note.mjs";

test("Linux create-only notes preserve edits, reject symlinks and publish once under concurrency", {
  skip: process.platform !== "linux"
}, async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "research-notes-"));
  const outside = await mkdtemp(path.join(os.tmpdir(), "research-outside-"));
  t.after(async () => {
    await rm(root, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  });
  const input = { folder: "Reading/Papers", filename: "zotero-ABCD1234.md", content: "Original note" };
  const results = await Promise.all(Array.from({ length: 5 }, () => createResearchNote(root, input)));
  assert.equal(results.filter((result) => result.state === "created").length, 1);
  assert.equal((await createResearchNote(root, { ...input, content: "Replacement" })).state, "existing");
  assert.equal(await readFile(path.join(root, input.folder, input.filename), "utf8"), "Original note");
  assert.deepEqual(await readdir(path.join(root, input.folder)), [input.filename]);
  await symlink(outside, path.join(root, "Escape"));
  await assert.rejects(createResearchNote(root, { ...input, folder: "Escape" }));
  await assert.rejects(createResearchNote(root, { ...input, folder: "Reading/../Escape" }));
  assert.deepEqual(await readdir(outside), []);
});
