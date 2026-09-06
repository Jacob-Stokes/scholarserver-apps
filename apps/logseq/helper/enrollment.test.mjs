import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readdir, readFile, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { callbackTarget, Enrollment } from "./enrollment.mjs";

async function fixture(t, fetchImpl, options = {}) {
  const runtime = await mkdtemp(path.join(os.tmpdir(), "logseq-enrollment-test-"));
  let finish;
  let configPath;
  let starts = 0;
  const enrollment = new Enrollment({
    runtime,
    root: "/graph",
    fetchImpl,
    ...options,
    runLogin: (config, signal) => {
      configPath = config;
      starts++;
      return new Promise((resolve, reject) => {
        finish = resolve;
        signal.addEventListener("abort", () => reject(new Error("private upstream diagnostic")), { once: true });
      });
    }
  });
  t.after(async () => {
    await enrollment.cancel();
    await rm(runtime, { recursive: true, force: true });
  });
  return { enrollment, runtime, config: () => configPath, finish: () => finish(), starts: () => starts };
}

test("remote login uses upstream PKCE settings and keeps its verifier private", async (t) => {
  const f = await fixture(t);
  const status = await f.enrollment.start();
  const url = new URL(status.authorizationUrl);
  assert.equal(url.origin, "https://logseq-prod.auth.us-east-1.amazoncognito.com");
  assert.equal(url.searchParams.get("redirect_uri"), "http://localhost:8765/auth/callback");
  const config = await readFile(f.config(), "utf8");
  const verifier = JSON.parse(config.match(/:oauth-code-verifier ("[^"]+")/)[1]);
  assert.equal(url.searchParams.get("code_challenge"), createHash("sha256").update(verifier).digest("base64url"));
  assert.equal((await stat(f.config())).mode & 0o777, 0o600);
  assert.ok(!JSON.stringify(status).includes(verifier));
  assert.deepEqual(await f.enrollment.start(), status);
  assert.equal(f.starts(), 1);
  f.finish();
  await f.enrollment.cancel();
  assert.deepEqual(await readdir(f.runtime), []);
});

test("an expired return link never reaches the listener", async (t) => {
  let now = 1000;
  let calls = 0;
  const f = await fixture(
    t,
    async () => {
      calls++;
      return new Response("ok");
    },
    { now: () => now }
  );
  const status = await f.enrollment.start();
  const state = new URL(status.authorizationUrl).searchParams.get("state");
  now += 300_001;
  await assert.rejects(
    f.enrollment.complete(`http://localhost:8765/auth/callback?state=${state}&code=synthetic`),
    /again/
  );
  assert.equal(calls, 0);
});

test("return links require exact destination, one state and one code", () => {
  const good = "http://localhost:8765/auth/callback?state=expected&code=synthetic";
  assert.equal(callbackTarget(good, "expected"), "http://[::1]:8765/auth/callback?state=expected&code=synthetic");
  const invalid = [
    good.replace("localhost", "example.com"),
    good.replace("8765", "8080"),
    good.replace("/auth/callback", "/health"),
    good.replace("http:", "https:"),
    good.replace("state=expected", "state=wrong"),
    good.replace("state=expected&", ""),
    `${good}&state=expected`,
    `${good}&code=second`,
    `${good}#fragment`,
    `${good}&next=http://internal`,
    good.replace("localhost", "user@localhost"),
    good.replace("synthetic", "%0A"),
    "not a URL"
  ];
  for (const value of invalid) assert.throws(() => callbackTarget(value, "expected"), /complete return link/);
});

test("invalid links do not reach the listener; accepted callbacks are never replayed", async (t) => {
  const requests = [];
  const f = await fixture(t, async (url, options) => {
    requests.push({ url, options });
    return new Response("ok");
  });
  const status = await f.enrollment.start();
  await assert.rejects(f.enrollment.complete("http://internal/"));
  assert.equal(requests.length, 0);
  const state = new URL(status.authorizationUrl).searchParams.get("state");
  const link = `http://localhost:8765/auth/callback?state=${state}&code=synthetic`;
  assert.equal((await f.enrollment.complete(link)).state, "authenticating");
  assert.equal(requests[0].options.redirect, "error");
  await assert.rejects(f.enrollment.complete(link), /again/);
  assert.equal(requests.length, 1);
  f.finish();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(f.enrollment.status().state, "connected");
});

test("interruption cancels the child; retry generates new state and verifier", async (t) => {
  const f = await fixture(t);
  const first = await f.enrollment.start();
  await f.enrollment.cancel();
  assert.equal(f.enrollment.status().state, "cancelled");
  assert.deepEqual(await readdir(f.runtime), []);
  const second = await f.enrollment.start();
  assert.notEqual(first.authorizationUrl, second.authorizationUrl);
  assert.equal(f.starts(), 2);
});

test("callback failure is classified and never exposes or replays the code", async (t) => {
  let calls = 0;
  const f = await fixture(t, async () => {
    calls++;
    throw new Error("secret-code");
  });
  const status = await f.enrollment.start();
  const state = new URL(status.authorizationUrl).searchParams.get("state");
  const result = await f.enrollment.complete(`http://localhost:8765/auth/callback?state=${state}&code=secret-code`);
  assert.equal(result.state, "failed");
  assert.doesNotMatch(JSON.stringify(result), /secret-code|private upstream/);
  assert.equal(calls, 1);
});
