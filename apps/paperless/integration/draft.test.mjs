import assert from "node:assert/strict";
import { access, chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { PaperlessClient, readSecret } from "./client.mjs";
import { advanceIngest, recoverIngest } from "./ingest-state.mjs";
import { paperlessTools } from "./tools.mjs";

async function fixture(t, respond) {
  const directory = await mkdtemp(path.join(tmpdir(), "paperless-draft-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const file = path.join(directory, "token");
  await writeFile(file, "a".repeat(40), { mode: 0o600 });
  const calls = [];
  const client = new PaperlessClient(file, async (url, options) => {
    calls.push({ url, options });
    return respond(url, options);
  });
  return { client, calls, file };
}
const json = (value, status = 200) =>
  new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });

test("exact read-only namespace; unknown fields, invalid IDs and oversized pages fail before I/O", async () => {
  const tools = paperlessTools({
    search() {
      assert.fail("No I/O expected");
    },
    document() {
      assert.fail("No I/O expected");
    }
  });
  assert.deepEqual(
    tools.map((tool) => tool.def.name),
    ["paperless_search_documents", "paperless_get_document", "paperless_get_document_text"]
  );
  for (const tool of tools) assert.equal(tool.def.annotations.readOnlyHint, true);
  for (const input of [
    { query: "x", limit: 21 },
    { query: "" },
    { query: "x", url: "http://elsewhere" },
    { query: "x", page: 101 }
  ]) {
    await assert.rejects(tools[0].handler(input));
  }
  for (const id of [0, -1, 1.5, "../tasks", Number.MAX_SAFE_INTEGER + 1])
    await assert.rejects(tools[1].handler({ id }));
});

test("search is fixed-origin GET with restricted account token, escaped query and bounded metadata", async (t) => {
  const { client, calls } = await fixture(t, () =>
    json({ results: [{ id: 7, title: "Scan", content: "private full text", owner: 9 }], next: "https://evil.invalid" })
  );
  const result = await paperlessTools(client)[0].handler({ query: "scan&owner=1" });
  assert.deepEqual(result, { untrusted: true, documents: [{ id: 7, title: "Scan" }], nextPage: 2 });
  assert.equal(calls.length, 1);
  assert.equal(new URL(calls[0].url).searchParams.get("query"), "scan&owner=1");
  assert.equal(new URL(calls[0].url).origin, "http://paperless:8000");
  assert.equal(calls[0].options.method, "GET");
  assert.equal(calls[0].options.redirect, "error");
  assert.equal(calls[0].options.headers.Authorization, `Token ${"a".repeat(40)}`);
});

test("native authorization failures are not retried with a stronger identity or leaked", async (t) => {
  for (const status of [401, 403, 404, 500]) {
    const { client, calls } = await fixture(t, () => json({ error: "SECRET upstream detail" }, status));
    await assert.rejects(client.document(4), (error) => !error.message.includes("SECRET"));
    assert.equal(calls.length, 1);
  }
});

test("large responses, malformed bodies, wrong document and bounded text", async (t) => {
  for (const value of [{ id: 2 }, { id: 1, content: "a".repeat(1_048_577) }]) {
    const { client } = await fixture(t, () => json(value));
    await assert.rejects(client.document(1, true));
  }
  const { client } = await fixture(t, () => json({ id: 1, title: "scan", content: "x".repeat(40_000) }));
  const result = await client.document(1, true);
  assert.equal(result.text.length, 32_000);
  assert.equal(result.truncated, true);
  const broken = await fixture(t, () => new Response("not JSON", { headers: { "content-type": "application/json" } }));
  await assert.rejects(broken.client.document(1), /upstream_unavailable/);
});

test("unavailable secret and network never issue an anonymous request or reveal raw errors", async (t) => {
  const { client, file, calls } = await fixture(t, () => {
    throw new Error("token=SECRET");
  });
  await assert.rejects(client.document(1), { message: "upstream_unavailable" });
  await chmod(file, 0o644);
  await assert.rejects(readSecret(file), /private_secret_file_required/);
  await assert.rejects(client.document(1));
  assert.equal(calls.length, 1);
});

test("ingest design model: interrupted write remains unknown and cannot resubmit", () => {
  const prepared = { operationId: "local-only", phase: "prepared" };
  assert.throws(() => advanceIngest(prepared, { type: "submit", confirmed: false }));
  const submitting = advanceIngest(prepared, { type: "submit", confirmed: true });
  const unknown = recoverIngest(JSON.parse(JSON.stringify(submitting)));
  assert.equal(unknown.phase, "unknown");
  assert.throws(() => advanceIngest(unknown, { type: "submit", confirmed: true }));
  assert.equal(advanceIngest(submitting, { type: "uncertain" }).phase, "unknown");
  const processing = advanceIngest(submitting, { type: "accepted", taskId: "00000000-0000-4000-8000-000000000001" });
  assert.deepEqual(recoverIngest(processing), processing);
  assert.equal(advanceIngest(processing, { type: "failed" }).phase, "failed");
  assert.equal(advanceIngest(processing, { type: "completed", documentId: 4 }).phase, "complete");
  assert.throws(() => advanceIngest(unknown, { type: "completed", documentId: 4 }));
});

test("parallel reads are capped without a deferred queue", async (t) => {
  const releases = [];
  const { client, calls } = await fixture(t, () => new Promise((resolve) => releases.push(resolve)));
  const reads = Array.from({ length: 4 }, () => client.document(1));
  while (releases.length < 4) await new Promise((resolve) => setImmediate(resolve));
  await assert.rejects(client.document(1), /busy/);
  assert.equal(calls.length, 4);
  for (const release of releases) release(json({ id: 1, title: "test" }));
  await Promise.all(reads);
  assert.equal(client.inflight, 0);
});

test("draft is outside release discovery with unusable placeholders and no catalog entry", async () => {
  const root = new URL("../../../", import.meta.url);
  await access(new URL("apps/paperless/RELEASE_BLOCKED.md", root));
  await assert.rejects(access(new URL("apps/paperless/package", root)));
  const compose = await readFile(new URL("apps/paperless/development/compose.yaml", root), "utf8");
  assert.equal((compose.match(/UNRESOLVED_\w+_DO_NOT_RUN/g) ?? []).length, 4);
  assert.doesNotMatch(compose, /sha256:|ports:|latest/);
  const release = await readFile(new URL("scripts/build-release.sh", root), "utf8");
  assert.match(release, /apps\/\*\/package\/scholarserver-app.yaml/);
});
