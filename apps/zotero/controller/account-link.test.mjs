import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createAccountLink, zoteroLoginUrl } from "./account-link.mjs";

async function fixture(t) {
  const directory = await mkdtemp(path.join(tmpdir(), "zotero-account-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const sessionPath = path.join(directory, "session.json");
  const calls = [];
  const identities = [];
  let reply = { state: "pending" };
  const dependencies = {
    sessionPath,
    callBridge: async (action, input) => {
      calls.push({ action, input });
      if (action === "account-start")
        return {
          sessionToken: "synthetic-token-123456",
          loginUrl: "https://www.zotero.org/login/session?session=synthetic"
        };
      if (reply instanceof Error) throw reply;
      return reply;
    },
    saveIdentity: async (identity) => {
      identities.push(identity);
    }
  };
  return {
    sessionPath,
    calls,
    identities,
    dependencies,
    setReply: (value) => {
      reply = value;
    },
    link: createAccountLink(dependencies)
  };
}

test("sign-in addresses stay on the official login origin", () => {
  assert.equal(
    zoteroLoginUrl("https://www.zotero.org/login?session=synthetic"),
    "https://www.zotero.org/login?session=synthetic"
  );
  assert.equal(
    zoteroLoginUrl("https://www.zotero.org/login/session?session=synthetic"),
    "https://www.zotero.org/login/session?session=synthetic"
  );
  for (const url of [
    "http://www.zotero.org/login/session",
    "https://www.zotero.org.evil.test/login/session",
    "https://evil.test/login/session",
    "https://user:password@www.zotero.org/login/session",
    "javascript:alert(1)",
    "https://www.zotero.org/settings"
  ]) {
    assert.throws(() => zoteroLoginUrl(url));
  }
});

test("duplicate starts resume one private session and public status omits secrets", async (t) => {
  const f = await fixture(t);
  await Promise.all([f.link.start(), f.link.start()]);
  assert.equal(f.calls.length, 1);
  assert.equal((await stat(f.sessionPath)).mode & 0o777, 0o600);
  assert.deepEqual(await f.link.snapshot(), { state: "pending" });
  assert.ok((await f.link.snapshot(true)).loginUrl);
  assert.equal(JSON.stringify(await f.link.snapshot(true)).includes("synthetic-token"), false);
});

test("controller restart resumes login without a browser or another upstream start", async (t) => {
  const f = await fixture(t);
  await f.link.start();
  const restarted = createAccountLink(f.dependencies);
  f.setReply({ state: "connected", userId: 123 });
  assert.deepEqual(await restarted.check(), { state: "connected" });
  assert.deepEqual(f.identities, [{ userId: "123" }]);
  assert.deepEqual(JSON.parse(await readFile(f.sessionPath, "utf8")), { state: "connected" });
  assert.equal(f.calls.filter((call) => call.action === "account-start").length, 1);
});

test("cancellation never saves an identity and permits a deliberate new login", async (t) => {
  const f = await fixture(t);
  await f.link.start();
  f.setReply({ state: "cancelled" });
  assert.deepEqual(await f.link.check(), { state: "cancelled" });
  assert.deepEqual(f.identities, []);
  await f.link.start();
  assert.equal(f.calls.filter((call) => call.action === "account-start").length, 2);
});

test("failed observations redact upstream secrets and retry only the saved session", async (t) => {
  const f = await fixture(t);
  await f.link.start();
  f.setReply(new Error("secret-token and private upstream content"));
  const failed = await f.link.check();
  assert.equal(failed.state, "pending");
  assert.doesNotMatch(JSON.stringify(failed), /secret-token|private upstream/);
  await f.link.start();
  f.setReply({ state: "pending" });
  await f.link.check();
  assert.deepEqual(await f.link.snapshot(), { state: "pending" });
  assert.equal(f.calls.filter((call) => call.action === "account-start").length, 1);
});

test("an interrupted start reconciles manual Zotero login, without replaying creation", async (t) => {
  const f = await fixture(t);
  await writeFile(f.sessionPath, JSON.stringify({ state: "starting" }));
  await f.link.start();
  assert.deepEqual(f.calls, []);
  f.setReply({ accountConnected: true, userId: 123 });
  assert.deepEqual(await f.link.check(), { state: "connected" });
  assert.equal(f.calls[0].action, "status");
});

test("legacy token-only state is reconciled and malformed storage fails closed", async (t) => {
  const f = await fixture(t);
  await writeFile(f.sessionPath, JSON.stringify({ sessionToken: "legacy-synthetic-token" }));
  assert.deepEqual(await f.link.start(), { state: "pending" });
  await f.link.check();
  assert.equal(f.calls[0].input.sessionToken, "legacy-synthetic-token");
  await writeFile(f.sessionPath, "broken-json");
  await assert.rejects(f.link.start(), /do not restart/);
  assert.equal((await f.link.snapshot()).state, "interrupted");
  assert.equal(f.calls.length, 1);
});
