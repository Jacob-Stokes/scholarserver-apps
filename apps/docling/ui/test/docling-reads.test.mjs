import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

function moduleUrl(source) {
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext }
  });
  return `data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`;
}
// Exercise the exact vendor resource without introducing another test/build dependency.
const sharedSource = await readFile(new URL(import.meta.resolve("@scholarserver/ui/read-resource")), "utf8");
const source = await readFile(new URL("../src/docling-reads.ts", import.meta.url), "utf8");
const { createDoclingReads, queuePollMilliseconds } = await import(
  moduleUrl(source.replace('"@scholarserver/ui/read-resource"', JSON.stringify(moduleUrl(sharedSource))))
);

const ready = {
  state: "ready",
  engine: "available",
  workerConcurrency: 1,
  counts: { queued: 0, running: 0, succeeded: 0, failed: 0 },
  jobs: [],
  outputFolder: "output",
  updatedAt: "2026-09-20T00:00:00Z"
};

function deferredFetch(t) {
  const requests = [];
  t.mock.method(
    globalThis,
    "fetch",
    (url, init) =>
      new Promise((resolve) => {
        requests.push({ url, signal: init.signal, resolve });
      })
  );
  return requests;
}

test("queue health does not hold up conversion defaults or file discovery", async (t) => {
  const requests = deferredFetch(t);
  const reads = createDoclingReads("/apps/docling-test");
  const queue = reads.status.refresh();
  const settings = reads.settings.refresh();
  const files = reads.files.refresh();
  await Promise.resolve();
  assert.deepEqual(
    requests.map((item) => item.url),
    ["/apps/docling-test/api/status", "/apps/docling-test/api/settings", "/apps/docling-test/api/files?limit=100"]
  );
  requests[1].resolve(Response.json({ defaultOcr: true }));
  requests[2].resolve(Response.json({ files: [] }));
  await Promise.all([settings, files]);
  assert.equal(reads.status.getSnapshot().pending, true);
  assert.deepEqual(reads.settings.getSnapshot().data, { defaultOcr: true });
  assert.deepEqual(reads.files.getSnapshot().data, []);
  requests[0].resolve(Response.json(ready));
  await queue;
});

test("access denial clears all three resources and suppresses a late sibling result", async (t) => {
  const requests = deferredFetch(t);
  const reads = createDoclingReads("/apps/docling-test");
  reads.status.seed(ready);
  reads.settings.seed({ defaultOcr: true });
  reads.files.seed([{ path: "private.pdf", bytes: 1024 }]);
  const queue = reads.status.refresh(true);
  const files = reads.files.refresh(true);
  await Promise.resolve();
  requests[0].resolve(new Response("{}", { status: 403 }));
  await queue;
  assert.equal(requests[1].signal.aborted, true);
  requests[1].resolve(Response.json({ files: [{ path: "late.pdf", bytes: 10 }] }));
  await files;
  for (const resource of [reads.status, reads.files, reads.settings]) {
    assert.equal(resource.getSnapshot().data, undefined);
    assert.equal(resource.getSnapshot().blocked, true);
    await resource.refresh();
  }
  assert.equal(requests.length, 2, "An automatic retry cannot reopen the denied scope");
});

test("a settings login redirect also blocks queue and file reads", async (t) => {
  t.mock.method(
    globalThis,
    "fetch",
    async () =>
      new Response("Login", {
        headers: { "content-type": "text/html" }
      })
  );
  const reads = createDoclingReads("/apps/docling-test");
  await reads.settings.refresh();
  for (const resource of [reads.status, reads.files, reads.settings]) {
    assert.equal(resource.getSnapshot().blocked, true);
    assert.match(resource.getSnapshot().error, /Sign in/);
  }
});

test("a cancelled read's late denial does not block a newer accepted result", async (t) => {
  const requests = deferredFetch(t);
  const reads = createDoclingReads("/apps/docling-test");
  const oldRead = reads.status.refresh();
  await Promise.resolve();
  reads.status.invalidate();
  const newRead = reads.status.refresh();
  await Promise.resolve();
  requests[1].resolve(Response.json(ready));
  await newRead;
  requests[0].resolve(new Response("{}", { status: 401 }));
  await oldRead;
  assert.equal(reads.status.getSnapshot().blocked, false);
  assert.deepEqual(reads.status.getSnapshot().data, ready);
  assert.equal(reads.settings.getSnapshot().blocked, false);
});

test("a retired scope stays blocked while an explicit new scope can load", async (t) => {
  t.mock.method(globalThis, "fetch", async () => Response.json(ready));
  const oldReads = createDoclingReads("/apps/docling-test");
  oldReads.block("Sign in again.");
  const newReads = createDoclingReads("/apps/docling-test");
  await newReads.status.refresh();
  oldReads.settings.seed({ defaultOcr: true });
  oldReads.status.invalidate();
  await oldReads.status.refresh();
  assert.equal(oldReads.settings.getSnapshot().data, undefined);
  assert.equal(oldReads.status.getSnapshot().blocked, true);
  assert.deepEqual(newReads.status.getSnapshot().data, ready);
});

test("transient settings/file failures retain known results without blocking other sections", async (t) => {
  t.mock.method(globalThis, "fetch", async () => new Response("{}", { status: 503 }));
  const reads = createDoclingReads("/apps/docling-test");
  reads.settings.seed({ defaultOcr: true });
  reads.files.seed([]);
  await Promise.all([reads.files.refresh(true), reads.settings.refresh(true)]);
  assert.deepEqual(reads.files.getSnapshot().data, []);
  assert.deepEqual(reads.settings.getSnapshot().data, { defaultOcr: true });
  assert.match(reads.settings.getSnapshot().error, /Could not load conversion defaults/);
  assert.equal(reads.status.getSnapshot().blocked, false);
});

test("malformed defaults and file lists never become accepted empty/default data", async (t) => {
  t.mock.method(globalThis, "fetch", async () => Response.json({}));
  const reads = createDoclingReads("/apps/docling-test");
  await Promise.all([reads.files.refresh(), reads.settings.refresh()]);
  assert.equal(reads.files.getSnapshot().data, undefined);
  assert.equal(reads.settings.getSnapshot().data, undefined);
  assert.match(reads.files.getSnapshot().error, /Could not list PDFs/);
  assert.match(reads.settings.getSnapshot().error, /Could not load conversion defaults/);
});

test("Docling polls idle queues slowly and active queues promptly", () => {
  assert.equal(queuePollMilliseconds(undefined), 30000);
  assert.equal(queuePollMilliseconds(ready), 30000);
  assert.equal(queuePollMilliseconds({ ...ready, counts: { ...ready.counts, running: 1 } }), 3000);
  assert.equal(queuePollMilliseconds({ ...ready, counts: { ...ready.counts, queued: 1 } }), 3000);
});
