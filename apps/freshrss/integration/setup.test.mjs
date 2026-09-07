import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { Setup } from "./setup.mjs";

async function fixture(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "freshrss-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const setup = new Setup(directory);
  await setup.initialize();
  return { directory, setup };
}
test("duplicate setup requests keep one account and one API credential", async (t) => {
  const { directory, setup } = await fixture(t);
  const input = { username: "researcher", password: "Synthetic-long-password" };
  await Promise.all([setup.connect(input), setup.connect(input)]);
  const first = await readFile(`${directory}/account.json`, "utf8");
  await setup.connect(input);
  assert.equal(await readFile(`${directory}/account.json`, "utf8"), first);
  assert.equal((await stat(`${directory}/account.json`)).mode & 0o777, 0o600);
  await assert.rejects(setup.connect({ ...input, username: "other" }), /already has an account/);
});
test("invalid credentials never reach a private request file", async (t) => {
  const { directory, setup } = await fixture(t);
  await assert.rejects(setup.connect({ username: "../escape", password: "short" }));
  await assert.rejects(readFile(`${directory}/account.json`), { code: "ENOENT" });
});
test("completed setup removes the web password but retains API access across restart", async (t) => {
  const { directory, setup } = await fixture(t);
  const token = await readFile(`${directory}/service-token`, "utf8");
  await setup.connect({ username: "researcher", password: "Synthetic-long-password" });
  await writeFile(`${directory}/worker-status.json`, JSON.stringify({ ready: true, phase: "ready" }));
  await writeFile(`${directory}/heartbeat`, "");
  const status = await setup.status();
  assert.equal(status.ready, true);
  assert.equal(status.password, undefined);
  const account = JSON.parse(await readFile(`${directory}/account.json`, "utf8"));
  assert.equal(account.password, undefined);
  assert.equal(account.apiPassword.length, 43);
  assert.equal(await new Setup(directory).initialize(), token);
});
test("a stale worker cannot report ready", async (t) => {
  const { directory, setup } = await fixture(t);
  await writeFile(`${directory}/worker-status.json`, JSON.stringify({ ready: true, phase: "ready" }));
  assert.equal((await setup.status()).ready, false);
});
