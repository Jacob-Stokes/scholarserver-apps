import assert from "node:assert/strict";
import { mkdir, mkdtemp, readdir, readFile, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { atomicJson, atomicWrite } from "./files.mjs";

test("concurrent state writes are complete, ordered, private and leave no temporary files", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "scholarserver-atomic-test-"));
  try {
    const file = path.join(dir, "state.json");
    await Promise.all(
      Array.from({ length: 100 }, (_, index) => atomicJson(file, { index, content: "synthetic".repeat(1000) }))
    );
    assert.equal(JSON.parse(await readFile(file, "utf8")).index, 99);
    assert.equal((await stat(file)).mode & 0o777, 0o600);
    assert.deepEqual(await readdir(dir), ["state.json"]);
    await atomicWrite(file, "public status", 0o644);
    assert.equal((await stat(file)).mode & 0o777, 0o644);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("failed writes do not poison later updates or leave partial state", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "scholarserver-atomic-test-"));
  try {
    const target = path.join(dir, "destination");
    await mkdir(target);
    await assert.rejects(atomicJson(target, { index: 1 }));
    assert.deepEqual(await readdir(dir), ["destination"]);
    await rm(target, { recursive: true });
    await atomicJson(target, { index: 2 });
    assert.deepEqual(JSON.parse(await readFile(target, "utf8")), { index: 2 });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
