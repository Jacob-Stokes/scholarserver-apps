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
const shared = moduleUrl(await readFile(new URL(import.meta.resolve("@scholarserver/ui/read-resource")), "utf8"));
const statusSource = await readFile(new URL("../src/reader-status.ts", import.meta.url), "utf8");
const status = moduleUrl(statusSource.replace('"@scholarserver/ui/read-resource"', JSON.stringify(shared)));
const source = await readFile(new URL("../src/reader-reads.ts", import.meta.url), "utf8");
const { createReaderReads } = await import(
  moduleUrl(
    source
      .replace('"@scholarserver/ui/read-resource"', JSON.stringify(shared))
      .replace('"./reader-status"', JSON.stringify(status))
  )
);

const ready = { phase: "ready", ready: true, username: "synthetic", signIn: "scholarserver" };
const addresses = { options: [], selection: null };
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

test("address and appearance reads complete independently of status", async (t) => {
  const requests = deferredFetch(t);
  const reads = createReaderReads("/apps/reader-test", "reader-test");
  const pendingStatus = reads.status.refresh();
  const pendingAddress = reads.addresses.refresh();
  const pendingAppearance = reads.appearance.refresh();
  await Promise.resolve();
  assert.deepEqual(
    requests.map((request) => request.url),
    [
      "/apps/reader-test/api/status",
      "/api/v1/instances/reader-test/endpoints/reader/access-options",
      "/apps/reader-test/api/appearance"
    ]
  );
  requests[1].resolve(Response.json(addresses));
  requests[2].resolve(Response.json({ style: "original" }));
  await Promise.all([pendingAddress, pendingAppearance]);
  assert.equal(reads.status.getSnapshot().pending, true);
  assert.deepEqual(reads.addresses.getSnapshot().data, addresses);
  requests[0].resolve(Response.json(ready));
  await pendingStatus;
});

for (const deniedPanel of ["status", "addresses", "appearance"]) {
  test(`${deniedPanel} denial blocks all siblings and ignores late success`, async (t) => {
    const requests = deferredFetch(t);
    const reads = createReaderReads("/apps/reader-test", "reader-test");
    reads.status.seed(ready);
    reads.addresses.seed(addresses);
    reads.appearance.seed({ style: "original" });
    const denied = reads[deniedPanel].refresh(true);
    const siblingName = deniedPanel === "status" ? "appearance" : "status";
    const sibling = reads[siblingName].refresh(true);
    await Promise.resolve();
    requests[0].resolve(new Response("Login", { headers: { "content-type": "text/html" } }));
    await denied;
    assert.equal(requests[1].signal.aborted, true);
    requests[1].resolve(Response.json(siblingName === "status" ? ready : { style: "scholarserver" }));
    await sibling;
    for (const name of ["status", "addresses", "appearance"]) {
      assert.equal(reads[name].getSnapshot().blocked, true);
      assert.equal(reads[name].getSnapshot().data, undefined);
      await reads[name].refresh();
    }
    assert.equal(requests.length, 2, "No automatic recovery after denial");
  });
}

test("cancelled read's late denial cannot clear a newer accepted value", async (t) => {
  const requests = deferredFetch(t);
  const reads = createReaderReads("/apps/reader-test", "reader-test");
  const oldRead = reads.appearance.refresh();
  await Promise.resolve();
  reads.appearance.invalidate();
  const newRead = reads.appearance.refresh();
  await Promise.resolve();
  requests[1].resolve(Response.json({ style: "scholarserver" }));
  await newRead;
  requests[0].resolve(new Response("{}", { status: 401 }));
  await oldRead;
  assert.equal(reads.status.getSnapshot().blocked, false);
  assert.deepEqual(reads.appearance.getSnapshot().data, { style: "scholarserver" });
});

test("explicit recovery leaves the old owner blocked against late save completion", async (t) => {
  t.mock.method(globalThis, "fetch", async () => Response.json({ style: "original" }));
  const oldReads = createReaderReads("/apps/reader-test", "reader-test");
  oldReads.block("Sign in again.");
  const newReads = createReaderReads("/apps/reader-test", "reader-test");
  await newReads.appearance.refresh();
  oldReads.appearance.seed({ style: "scholarserver" });
  oldReads.status.invalidate();
  await oldReads.status.refresh();
  assert.equal(oldReads.appearance.getSnapshot().data, undefined);
  assert.equal(oldReads.status.getSnapshot().blocked, true);
  assert.deepEqual(newReads.appearance.getSnapshot().data, { style: "original" });
});

test("transient refresh failure retains accepted values and does not revoke siblings", async (t) => {
  t.mock.method(globalThis, "fetch", async () => new Response("{}", { status: 503 }));
  const reads = createReaderReads("/apps/reader-test", "reader-test");
  reads.addresses.seed(addresses);
  reads.appearance.seed({ style: "original" });
  await Promise.all([reads.addresses.refresh(true), reads.appearance.refresh(true)]);
  assert.deepEqual(reads.addresses.getSnapshot().data, addresses);
  assert.deepEqual(reads.appearance.getSnapshot().data, { style: "original" });
  assert.match(reads.appearance.getSnapshot().error, /Could not load/);
  assert.equal(reads.status.getSnapshot().blocked, false);
});

test("malformed settings never become accepted defaults or an empty address list", async (t) => {
  t.mock.method(globalThis, "fetch", async () => Response.json({}));
  const reads = createReaderReads("/apps/reader-test", "reader-test");
  await Promise.all([reads.addresses.refresh(), reads.appearance.refresh()]);
  assert.equal(reads.addresses.getSnapshot().data, undefined);
  assert.equal(reads.appearance.getSnapshot().data, undefined);
  assert.match(reads.appearance.getSnapshot().error, /Could not read/);
  assert.match(reads.addresses.getSnapshot().error, /Could not read/);
});

test("no instance means no invented Manager request", async (t) => {
  const requests = deferredFetch(t);
  const reads = createReaderReads("", undefined);
  await reads.addresses.refresh();
  assert.equal(requests.length, 0);
  assert.match(reads.addresses.getSnapshot().error, /Open this application from ScholarServer/);
});
