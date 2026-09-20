import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../src/status-observer.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext }
});
const { observeStatus, StatusAuthenticationRequired } = await import(
  `data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`
);

function harness(t) {
  const requests = [];
  const accepted = [];
  const errors = [];
  const pending = [];
  let visible = true;
  const observer = observeStatus({
    intervalMs: 2000,
    read: (signal) =>
      new Promise((resolve, reject) => {
        requests.push({ signal, resolve, reject });
      }),
    accept: (value) => accepted.push(value),
    failed: (error) => errors.push(error),
    pending: (value) => pending.push(value),
    visible: () => visible
  });
  t.after(() => observer.stop());
  return {
    requests,
    accepted,
    errors,
    pending,
    observer,
    hide: () => (visible = false),
    show: () => (visible = true)
  };
}

test("a completed action refresh supersedes an old poll, even when cancellation is ignored", async (t) => {
  const { observer, requests, accepted } = harness(t);
  const oldRead = observer.refresh();
  const newRead = observer.refresh();
  assert.equal(requests[0].signal.aborted, true);
  requests[1].resolve({ phase: "ready" });
  await newRead;
  requests[0].resolve({ phase: "downloading" });
  await oldRead;
  assert.deepEqual(accepted, [{ phase: "ready" }]);
});

test("a superseded failure cannot replace successful current status", async (t) => {
  const { observer, requests, accepted, errors } = harness(t);
  const oldRead = observer.refresh();
  const newRead = observer.refresh();
  requests[1].resolve("connected");
  await newRead;
  requests[0].reject(new Error("old timeout"));
  await oldRead;
  assert.deepEqual(accepted, ["connected"]);
  assert.deepEqual(errors, []);
});

test("unmount cancels reads and suppresses late results and future refreshes", async (t) => {
  const { observer, requests, accepted, errors } = harness(t);
  const reading = observer.refresh();
  observer.stop();
  assert.equal(requests[0].signal.aborted, true);
  requests[0].resolve("late result");
  await reading;
  await observer.refresh();
  assert.equal(requests.length, 1);
  assert.deepEqual(accepted, []);
  assert.deepEqual(errors, []);
});

test("slow reads do not overlap; a failed read schedules recovery", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { observer, requests, accepted, errors } = harness(t);
  const reading = observer.refresh();
  t.mock.timers.tick(10000);
  assert.equal(requests.length, 1);
  requests[0].reject(new Error("offline"));
  await reading;
  assert.equal(errors.length, 1);
  t.mock.timers.tick(1999);
  assert.equal(requests.length, 1);
  t.mock.timers.tick(1);
  assert.equal(requests.length, 2);
  requests[1].resolve("reconnected");
  await Promise.resolve();
  assert.deepEqual(accepted, ["reconnected"]);
});

test("hidden pages do not poll and refresh when visible again", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const h = harness(t);
  h.hide();
  await h.observer.refresh();
  assert.equal(h.requests.length, 0);
  h.show();
  const reading = h.observer.refresh();
  assert.equal(h.requests.length, 1);
  h.requests[0].resolve("visible");
  await reading;
  assert.deepEqual(h.accepted, ["visible"]);
});

test("authentication expiry clears automatic polling until explicit retry", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const h = harness(t);
  const first = h.observer.refresh();
  h.requests[0].reject(new StatusAuthenticationRequired("sign in again"));
  await first;
  t.mock.timers.tick(60000);
  await h.observer.refresh();
  assert.equal(h.requests.length, 1);
  assert.equal(h.errors.length, 1);

  const retry = h.observer.retry();
  assert.equal(h.requests.length, 2);
  h.requests[1].resolve("restored");
  await retry;
  assert.deepEqual(h.accepted, ["restored"]);
});

test("a mutation authentication denial invalidates an older observation", async (t) => {
  const h = harness(t);
  const oldRead = h.observer.refresh();
  h.observer.block();
  assert.equal(h.requests[0].signal.aborted, true);
  h.requests[0].resolve("stale private status");
  await oldRead;
  await h.observer.refresh();
  assert.deepEqual(h.accepted, []);
  assert.equal(h.requests.length, 1);
  assert.equal(h.pending.at(-1), false);
});

test("hiding during a read ignores its late result without inventing a failure", async (t) => {
  const h = harness(t);
  const oldRead = h.observer.refresh();
  h.hide();
  await h.observer.refresh();
  h.requests[0].resolve("stale result");
  await oldRead;
  assert.deepEqual(h.accepted, []);
  assert.deepEqual(h.errors, []);
  assert.equal(h.pending.at(-1), false);
});
