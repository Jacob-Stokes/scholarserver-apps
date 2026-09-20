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
const source = (await readFile(new URL("../src/obsidian-reads.ts", import.meta.url), "utf8")).replace(
  '"@scholarserver/ui/read-resource"',
  JSON.stringify(shared)
);
const { createObsidianReads, statusPresentation, statusPollMilliseconds } = await import(moduleUrl(source));
const status = {
  state: "livesync-device-setup",
  profile: "livesync",
  scopePath: "/",
  remoteVault: null,
  workerRunning: false
};

test("legacy status credentials cannot enter the retained snapshot", () => {
  const result = statusPresentation({
    ...status,
    liveSyncOnboarding: { setupPassphrase: "synthetic-secret" },
    setupURI: "synthetic-secret",
    liveSyncWorker: { state: "waiting", setupPassphrase: "synthetic-secret" }
  });
  assert(!JSON.stringify(result).includes("synthetic-secret"));
});

test("ordinary refresh failure retains accepted status without fetching device details", async (t) => {
  const calls = [];
  t.mock.method(globalThis, "fetch", async (url) => {
    calls.push(url);
    if (calls.length === 2) throw new Error("offline");
    return Response.json(status);
  });
  const reads = createObsidianReads("/apps/example");
  await reads.status.refresh();
  await reads.status.refresh(true);
  assert.equal(reads.status.getSnapshot().data.state, status.state);
  assert.match(reads.status.getSnapshot().error, /offline/);
  assert.deepEqual(calls, ["/apps/example/api/status", "/apps/example/api/status"]);
});

test("access expiry discards status and requires a fresh owner", async (t) => {
  let expired = false;
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    calls++;
    return expired ? new Response("", { status: 401 }) : Response.json(status);
  });
  const reads = createObsidianReads("");
  await reads.status.refresh();
  expired = true;
  await reads.status.refresh(true);
  assert.equal(reads.status.getSnapshot().data, undefined);
  assert.equal(reads.accessSignal.aborted, true);
  expired = false;
  await reads.status.refresh(true);
  assert.equal(calls, 2);
  const next = createObsidianReads("");
  await next.status.refresh();
  assert.equal(next.status.getSnapshot().data.state, status.state);
});

test("active setup is checked more often than an idle or connected vault", () => {
  assert.equal(statusPollMilliseconds({ ...status, state: "livesync-server-joining" }), 2000);
  assert.equal(statusPollMilliseconds({ ...status, state: "ready" }), 30000);
  assert.equal(statusPollMilliseconds(status), 30000);
});
