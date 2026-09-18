import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { bindingFingerprint, validateBinding, verifyBrowserIdentity } from "./browser-identity.mjs";
import { readerCachePolicy, readerUpstreamHeaders } from "./cache-policy.mjs";
import { Setup } from "./setup.mjs";

const keys = generateKeyPairSync("ed25519");
const binding = {
  version: 1,
  audience: "personal/reader",
  subject: "owner-uid",
  username: "owner",
  publicKey: keys.publicKey.export({ type: "spki", format: "pem" })
};
const now = 1_800_000_000;
function assertion(overrides = {}, privateKey = keys.privateKey, header = { alg: "EdDSA", typ: "JWT" }) {
  const claims = {
    iss: "scholarserver-manager",
    aud: binding.audience,
    sub: binding.subject,
    endpoint: "reader",
    method: "GET",
    path: "/i/",
    iat: now,
    exp: now + 30,
    ...overrides
  };
  const message = [header, claims].map((value) => Buffer.from(JSON.stringify(value)).toString("base64url")).join(".");
  return `${message}.${sign(null, Buffer.from(message), privateKey).toString("base64url")}`;
}
test("reader identity accepts only the bound owner, instance, request and short validity window", () => {
  assert.deepEqual(validateBinding(binding), binding);
  const accepts = (token) => verifyBrowserIdentity(token, binding, "GET", "/i/", now * 1000);
  assert.equal(accepts(assertion()), true);
  for (const change of [
    { iss: "other" },
    { aud: "personal/other" },
    { sub: "other" },
    { endpoint: "app-ui" },
    { method: "POST" },
    { path: "/i/?a=delete" },
    { exp: now },
    { iat: now + 10 },
    { exp: now + 3600 },
    { iat: now - 60 },
    { exp: "tomorrow" }
  ])
    assert.equal(accepts(assertion(change)), false, JSON.stringify(change));
  assert.equal(accepts(assertion({}, generateKeyPairSync("ed25519").privateKey)), false);
  assert.equal(accepts(assertion({}, keys.privateKey, { alg: "none", typ: "JWT" })), false);
  for (const token of [undefined, "owner", "a.b.c", `${assertion()}.extra`, "a".repeat(4097)])
    assert.equal(accepts(token), false);
  assert.equal(verifyBrowserIdentity(assertion(), binding, "GET", "/i/", (now + 31) * 1000), false);
});
test("forwarding strips all caller-controlled identities even before sign-in migration", () => {
  const headers = {
    "Remote-User": "admin",
    "X-WebAuth-User": "admin",
    "x-authentik-username": "admin",
    "x-forwarded-user": "admin",
    "x-scholarserver-browser-identity": "signed",
    authorization: "Bearer private",
    cookie: "authentik_session=private; FreshRSS=reader"
  };
  const forwarded = readerUpstreamHeaders(headers, readerCachePolicy({ method: "GET", url: "/i/" }));
  assert.deepEqual(forwarded, { cookie: " FreshRSS=reader" });
});
test("linking preserves the existing account and API key, rejects rebinding, and resumes after restart", async (t) => {
  const runtime = await mkdtemp(path.join(os.tmpdir(), "reader-signin-"));
  t.after(() => rm(runtime, { recursive: true, force: true }));
  const setup = new Setup(runtime);
  await setup.initialize();
  await setup.connect({ username: "existing", password: "Synthetic-password-only" });
  const account = await readFile(`${runtime}/account.json`, "utf8");
  await setup.linkSignIn({ scholarserverBrowserIdentity: binding });
  assert.equal(await readFile(`${runtime}/account.json`, "utf8"), account);
  assert.equal((await setup.status()).ready, false);
  await assert.rejects(
    setup.linkSignIn({ scholarserverBrowserIdentity: { ...binding, subject: "other" } }),
    /different sign-in/
  );
  await assert.rejects(setup.linkSignIn({ scholarserverBrowserIdentity: binding, username: "replacement" }));
  const restarted = new Setup(runtime);
  await restarted.initialize();
  await restarted.linkSignIn({ scholarserverBrowserIdentity: binding });
  assert.equal(await readFile(`${runtime}/account.json`, "utf8"), account);
  await writeFile(`${runtime}/worker-status.json`, JSON.stringify({ ready: true, phase: "ready" }));
  await writeFile(`${runtime}/heartbeat`, "");
  await writeFile(
    `${runtime}/browser-identity-ready.json`,
    JSON.stringify({ fingerprint: bindingFingerprint(binding) })
  );
  assert.equal((await restarted.status()).ready, true);
  const after = JSON.parse(await readFile(`${runtime}/account.json`, "utf8"));
  assert.equal(after.apiPassword, JSON.parse(account).apiPassword);
  assert.equal(after.username, "existing");
});
test("fresh shared-sign-in setup creates one account without a user-supplied password", async (t) => {
  const runtime = await mkdtemp(path.join(os.tmpdir(), "reader-signin-new-"));
  t.after(() => rm(runtime, { recursive: true, force: true }));
  const setup = new Setup(runtime);
  await setup.initialize();
  await setup.linkSignIn({ scholarserverBrowserIdentity: binding });
  const account = JSON.parse(await readFile(`${runtime}/account.json`, "utf8"));
  assert.equal(account.username, "researcher");
  assert.equal(account.password.length, 43);
});
