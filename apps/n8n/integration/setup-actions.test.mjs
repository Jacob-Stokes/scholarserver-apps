import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, symlink, utimes } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { atomicJson } from "@scholarserver/controller-runtime/files";
import { startSetupActions } from "./setup-actions.mjs";

test("action consumes its secret file before setup and returns only a sanitized result", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "n8n-action-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const name = `${"a".repeat(32)}.json`;
  const request = path.join(directory, "requests", name);
  const response = path.join(directory, "responses", name);
  const stop = await startSetupActions(directory, {
    async finish(input) {
      assert.equal(input.password, "private-test-input");
      await assert.rejects(readFile(request), { code: "ENOENT" });
      throw new Error("private-test-input in upstream failure");
    }
  });
  t.after(stop);
  await atomicJson(request, { action: "setup", input: { password: "private-test-input" } });
  let result;
  for (let attempt = 0; attempt < 40; attempt++) {
    result = await readFile(response, "utf8").catch(() => null);
    if (result) break;
    await delay(25);
  }
  assert.ok(result);
  assert.equal(JSON.parse(result).ok, false);
  assert.doesNotMatch(result, /private-test-input/);
});

test("expired and symbolic-link requests never execute; old orphan responses are collected", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "n8n-action-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  let calls = 0;
  const stop = await startSetupActions(directory, {
    finish: async () => {
      calls++;
    }
  });
  t.after(stop);
  const expired = path.join(directory, "requests", `${"b".repeat(32)}.json`);
  const linked = path.join(directory, "requests", `${"c".repeat(32)}.json`);
  const orphan = path.join(directory, "responses", `${"d".repeat(32)}.json`);
  const target = path.join(directory, "not-a-request.json");
  await atomicJson(target, { action: "setup", input: {} });
  await atomicJson(expired, { action: "setup", input: {} });
  await atomicJson(orphan, { ok: true });
  const old = new Date(Date.now() - 600000);
  await utimes(expired, old, old);
  await utimes(orphan, old, old);
  await symlink(target, linked);
  await delay(600);
  assert.equal(calls, 0);
  for (const file of [expired, linked, orphan]) await assert.rejects(readFile(file), { code: "ENOENT" });
  assert.ok(await readFile(target));
});
