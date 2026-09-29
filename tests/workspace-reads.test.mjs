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
async function sourceModule(url, replacements = {}) {
  let source = await readFile(url, "utf8");
  source = source.replaceAll("import.meta.url", JSON.stringify(url.href));
  for (const [name, replacement] of Object.entries(replacements))
    source = source.replaceAll(JSON.stringify(name), JSON.stringify(replacement));
  return moduleUrl(source);
}
const shared = await sourceModule(new URL(import.meta.resolve("@scholarserver/ui/read-resource")));
const icons = await sourceModule(new URL("../apps/n8n/ui/src/app-icons.ts", import.meta.url));
const { createZoteroReads, statusPresentation } = await import(
  await sourceModule(new URL("../apps/zotero/ui/src/zotero-reads.ts", import.meta.url), {
    "@scholarserver/ui/read-resource": shared
  })
);
const { createN8nReads } = await import(
  await sourceModule(new URL("../apps/n8n/ui/src/n8n-reads.ts", import.meta.url), {
    "@scholarserver/ui/read-resource": shared,
    "./app-icons": icons
  })
);
const status = {
  state: "ready",
  connectionMode: "complete-workspace",
  features: { desktop: true, automations: true, localAttachments: true }
};
const inventory = { templates: [], installations: {}, workflows: [], moreAvailable: false };

test("Zotero attachment status excludes account credentials", () => {
  const snapshot = statusPresentation({
    ...status,
    apiKey: "synthetic-secret",
    webdavPassword: "synthetic-secret",
    loginUrl: "synthetic-secret"
  });
  assert(!JSON.stringify(snapshot).includes("synthetic-secret"));
});

test("n8n inventory is independent of slow discovery and shares discovery across consumers", async (t) => {
  let release;
  let discoveryCalls = 0;
  t.mock.method(globalThis, "fetch", async (url) => {
    if (url.endsWith("research-applications")) {
      discoveryCalls++;
      return new Promise((resolve) => {
        release = () => resolve(Response.json([]));
      });
    }
    return Response.json(inventory);
  });
  const reads = createN8nReads("/apps/engine");
  const first = reads.applications.refresh();
  const second = reads.applications.refresh();
  await reads.inventory.refresh();
  assert.deepEqual(reads.inventory.getSnapshot().data, inventory);
  assert.equal(reads.applications.getSnapshot().pending, true);
  release();
  await Promise.all([first, second]);
  assert.equal(discoveryCalls, 1);
});

test("n8n research permission setup failure does not masquerade as expired browser sign-in", async (t) => {
  t.mock.method(globalThis, "fetch", async () =>
    Response.json({ code: "research_connection_required" }, { status: 409 })
  );
  const reads = createN8nReads("");
  await reads.applications.refresh();
  assert.match(reads.applications.getSnapshot().error, /Allow research app access/);
  assert.equal(reads.accessSignal.aborted, false);
});

test("n8n inventory remains visible after a transient read error without replaying a write", async (t) => {
  const calls = [];
  t.mock.method(globalThis, "fetch", async (_url, init) => {
    calls.push(init.method);
    if (calls.length === 2) throw new Error("offline");
    return Response.json(inventory);
  });
  const reads = createN8nReads("/apps/test");
  await reads.inventory.refresh();
  await reads.inventory.refresh(true);
  assert.deepEqual(reads.inventory.getSnapshot().data, inventory);
  assert.match(reads.inventory.getSnapshot().error, /offline/);
  assert.deepEqual(calls, ["GET", "GET"]);
});

test("Zotero denies a late attachment response after the shared session loses access", async (t) => {
  let release;
  t.mock.method(globalThis, "fetch", async (url) => {
    if (url.endsWith("status")) return Response.json(status);
    if (url.endsWith("attachments/resolve"))
      return new Promise((resolve) => {
        release = () => resolve(Response.json({ attachmentKey: "ABCD1234" }));
      });
    return new Response("", { status: 401 });
  });
  const reads = createZoteroReads("/apps/test");
  await reads.status.refresh();
  const pending = reads.request("attachments/resolve", { method: "POST" });
  await assert.rejects(reads.request("attachments/match", { method: "POST" }), /sign in again/);
  release();
  await assert.rejects(pending);
  assert.equal(reads.status.getSnapshot().data, undefined);
  assert.equal(reads.accessSignal.aborted, true);
  await reads.status.refresh(true);
  assert.equal(reads.status.getSnapshot().blocked, true);
});

test("n8n child denial clears sibling data and blocks late successful reads", async (t) => {
  let release;
  t.mock.method(globalThis, "fetch", async (url) => {
    if (url.endsWith("status")) return Response.json({ connected: true, phase: "ready" });
    if (url.endsWith("automations"))
      return new Promise((resolve) => {
        release = () => resolve(Response.json(inventory));
      });
    return new Response("", { status: 401 });
  });
  const reads = createN8nReads("/apps/test");
  await reads.status.refresh();
  const pending = reads.inventory.refresh();
  await reads.applications.refresh();
  release();
  await pending;
  assert.equal(reads.status.getSnapshot().data, undefined);
  assert.equal(reads.inventory.getSnapshot().data, undefined);
  assert.equal(reads.accessSignal.aborted, true);
  await reads.status.refresh(true);
  assert.equal(reads.status.getSnapshot().blocked, true);
});
