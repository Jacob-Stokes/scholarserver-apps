import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../src/status-observer.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext }
});
const { observeStatus } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);

function harness(t) {
  const requests = [];
  const accepted = [];
  const errors = [];
  const observer = observeStatus({
    intervalMs: 2000,
    read: (signal) =>
      new Promise((resolve, reject) => {
        requests.push({ signal, resolve, reject });
      }),
    accept: (value) => accepted.push(value),
    failed: (error) => errors.push(error)
  });
  t.after(() => observer.stop());
  return { requests, accepted, errors, observer };
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
