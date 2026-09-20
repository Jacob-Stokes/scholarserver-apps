import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../src/reader-status.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext }
});
const { observeReaderStatus, readReaderJson, ReaderSignInRequired } = await import(
  `data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`
);
const ready = { phase: "ready", ready: true, signIn: "scholarserver", username: "synthetic" };
function harness(t) {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const requests = [],
    accepted = [],
    errors = [],
    pending = [];
  let visible = true;
  const observer = observeReaderStatus({
    read: (signal) => new Promise((resolve, reject) => requests.push({ signal, resolve, reject })),
    accept: (value) => accepted.push(value),
    failed: (error) => errors.push(error),
    pending: (value) => pending.push(value),
    visible: () => visible
  });
  t.after(() => observer.stop());
  return {
    observer,
    requests,
    accepted,
    errors,
    pending,
    hide: () => {
      visible = false;
    }
  };
}
test("slow observations never overlap, ready readers poll every thirty seconds", async (t) => {
  const h = harness(t);
  const first = h.observer.refresh();
  t.mock.timers.tick(6000);
  await h.observer.refresh();
  assert.equal(h.requests.length, 1);
  h.requests[0].resolve(ready);
  await first;
  t.mock.timers.tick(29999);
  assert.equal(h.requests.length, 1);
  t.mock.timers.tick(1);
  assert.equal(h.requests.length, 2);
  assert.deepEqual(h.accepted, [ready]);
});
test("preparation is observed promptly and hidden pages do not poll", async (t) => {
  const h = harness(t);
  const first = h.observer.refresh();
  h.requests[0].resolve({ ...ready, phase: "preparing", ready: false });
  await first;
  t.mock.timers.tick(2000);
  assert.equal(h.requests.length, 2);
  h.hide();
  h.requests[1].resolve(ready);
  await Promise.resolve();
  t.mock.timers.tick(30000);
  assert.equal(h.requests.length, 2);
});
test("stopping for a setup write ignores an older result even if abort is ignored", async (t) => {
  const h = harness(t);
  const first = h.observer.refresh();
  h.observer.stop();
  assert.equal(h.requests[0].signal.aborted, true);
  h.requests[0].resolve({ ...ready, ready: false });
  await first;
  assert.deepEqual(h.accepted, []);
  t.mock.timers.tick(60000);
  assert.equal(h.requests.length, 1);
});
test("ordinary failure retains accepted data and schedules recovery", async (t) => {
  const h = harness(t);
  const first = h.observer.refresh();
  h.requests[0].resolve(ready);
  await first;
  const second = h.observer.refresh();
  h.requests[1].reject(new Error("offline"));
  await second;
  assert.deepEqual(h.accepted, [ready]);
  assert.equal(h.errors.length, 1);
  assert.equal(h.pending.at(-1), false);
  t.mock.timers.tick(30000);
  assert.equal(h.requests.length, 3);
});
test("lost sign-in blocks automatic and visibility retries", async (t) => {
  const h = harness(t);
  const first = h.observer.refresh();
  h.requests[0].reject(new ReaderSignInRequired("sign in"));
  await first;
  t.mock.timers.tick(60000);
  await h.observer.refresh();
  assert.equal(h.requests.length, 1);
  assert.equal(h.errors.length, 1);
});
test("authentication errors and HTML login redirects are not treated as app status", async () => {
  for (const status of [401, 403]) {
    await assert.rejects(readReaderJson(new Response("{}", { status }), "failed"), ReaderSignInRequired);
  }
  await assert.rejects(
    readReaderJson(new Response("login", { headers: { "content-type": "text/html" } }), "failed"),
    ReaderSignInRequired
  );
  await assert.rejects(readReaderJson(new Response("{}", { status: 503 }), "failed"), /failed/);
  assert.deepEqual(await readReaderJson(Response.json(ready), "failed"), ready);
});
