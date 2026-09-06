import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { atomicJson } from "@scholarserver/controller-runtime/files";
import { privateSyncAddress, readSyncAddress, runSync } from "./sync-launcher.mjs";

test("sync addresses accept only private root HTTPS routes, never credentials or extra URL components", () => {
  assert.equal(privateSyncAddress("https://test.example.ts.net:12000/"), "https://test.example.ts.net:12000");
  for (const value of [
    "http://test.ts.net:12000/",
    "https://user:password@test.ts.net:12000/",
    "https://test.ts.net:443/",
    "https://test.ts.net:12000/path",
    "https://test.ts.net:12000/?token=secret",
    "https://test.ts.net:12000/#fragment",
    "https://example.com:12000/"
  ]) {
    assert.throws(() => privateSyncAddress(value));
  }
});

test("address changes stop the old upstream process before starting another; retries keep it running", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "logseq-launcher-"));
  const file = path.join(root, "address.json");
  let previous;
  const addresses = [];
  const close = await runSync({
    file,
    intervalMs: 10,
    start: (address) => {
      if (previous) assert.ok(previous.exitCode !== null || previous.signalCode !== null, "two writers would overlap");
      addresses.push(address);
      previous = spawn(process.execPath, ["-e", "setInterval(()=>{},1000)"], { stdio: "ignore" });
      return previous;
    }
  });
  t.after(async () => {
    await close();
    await rm(root, { recursive: true, force: true });
  });
  assert.equal(await readSyncAddress(file), null);
  const url = "https://test.example.ts.net:12000/";
  await atomicJson(file, { url });
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.deepEqual(addresses, ["http://sync:8787", "https://test.example.ts.net:12000"]);
  await atomicJson(file, { url });
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(addresses.length, 2);
  await close();
  assert.ok(previous.exitCode !== null || previous.signalCode !== null);
});
