import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { nativeClient } from "./native.mjs";
import { PdfService, pdfTools } from "./service.mjs";

const original = Buffer.from("%PDF-1.7\noriginal fixture; not a real parsed PDF").toString("base64");
const rotated = Buffer.from("%PDF-1.7\nrotated fixture; mock result").toString("base64");
async function fixture(t, native) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "stirling-draft-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const service = new PdfService(directory, native);
  await service.initialize();
  return { service, directory };
}
test("rotation calls only native MCP, keeps original and persists a distinct result", async (t) => {
  const { service, directory } = await fixture(t, async (name, args) => {
    assert.equal(name, "stirling_pages");
    assert.deepEqual(args, {
      operation: "rotate-pdf",
      file: original,
      fileName: "input.pdf",
      parameters: { angle: 90 }
    });
    return { content: [{ type: "resource", resource: { blob: rotated } }] };
  });
  const { artifactId } = await service.upload(original);
  const job = await service.run("rotate", artifactId, 90);
  assert.equal(job.outcome, "complete");
  assert.notEqual(job.outputId, artifactId);
  assert.equal((await service.download(artifactId)).file, original);
  assert.equal((await service.download(job.outputId)).file, rotated);
  const restored = new PdfService(directory, () => assert.fail("must not replay"));
  await restored.initialize();
  assert.equal((await restored.status()).jobs[0].outputId, job.outputId);
});
test("timeout stays unknown across restart and never repeats the call", async (t) => {
  let calls = 0;
  const { service, directory } = await fixture(t, async () => {
    calls++;
    throw new Error("private upstream failure");
  });
  const { artifactId } = await service.upload(original);
  const job = await service.run("inspect", artifactId);
  assert.equal(job.outcome, "unknown");
  assert.ok(!JSON.stringify(job).includes("private upstream"));
  const restored = new PdfService(directory, () => assert.fail("must not replay"));
  assert.equal((await restored.status()).jobs[0].outcome, "unknown");
  assert.equal(calls, 1);
});
test("rejects paths, URLs, extra options, invalid angles and oversized/non-PDF uploads", async (t) => {
  const { service } = await fixture(t, () => assert.fail("must not dispatch"));
  for (const value of ["../secrets", "https://example.com/a.pdf", "/etc/passwd"])
    await assert.rejects(service.download(value));
  await assert.rejects(service.upload(Buffer.from("not pdf").toString("base64")));
  await assert.rejects(service.upload(Buffer.alloc(1_000_001).toString("base64")));
  const tools = pdfTools(service);
  assert.deepEqual(
    tools.map((tool) => tool.def.name),
    ["stirling_upload", "stirling_inspect", "stirling_rotate", "stirling_download", "stirling_status"]
  );
  const rotate = tools.find((tool) => tool.def.name === "stirling_rotate");
  assert.throws(() => rotate.def.inputSchema.parse({ artifactId: "a", angle: 1, url: "https://example.com" }));
  await assert.rejects(service.run("delete", "invalid"));
});
test("no queue: concurrent operations are refused and invalid native output is not published", async (t) => {
  let release;
  const { service, directory } = await fixture(
    t,
    () =>
      new Promise((resolve) => {
        release = resolve;
      })
  );
  const { artifactId } = await service.upload(original);
  const running = service.run("rotate", artifactId, 90);
  while (!release) await new Promise((resolve) => setImmediate(resolve));
  await assert.rejects(service.upload(original), /already running/);
  release({ content: [{ type: "resource", resource: { blob: "bm90IGEgcGRm" } }] });
  assert.equal((await running).outcome, "unknown");
  assert.equal((await readdir(directory)).filter((entry) => entry.endsWith(".pdf")).length, 1);
});
test("native transport fixes destination, disables redirects and redacts raw errors", async () => {
  const client = nativeClient("private-test-key", async (url, options) => {
    assert.equal(url, "http://stirling:8080/mcp");
    assert.equal(options.redirect, "error");
    assert.equal(options.headers["x-api-key"], "private-test-key");
    const request = JSON.parse(options.body);
    return new Response(
      JSON.stringify({ jsonrpc: "2.0", id: request.id, result: { content: [{ type: "text", text: "report" }] } })
    );
  });
  assert.equal((await client("stirling_security", {})).content[0].text, "report");
  await assert.rejects(client("arbitrary_proxy", {}));
});
test("draft remains outside release discovery with unusable image references", async () => {
  const root = new URL("../../", import.meta.url);
  const entries = await readdir(new URL("stirling-pdf/", root));
  assert.ok(!entries.includes("package"));
  const release = await readFile(new URL("../scripts/build-release.sh", root), "utf8");
  assert.ok(release.includes("apps/*/package/scholarserver-app.yaml"));
  const compose = await readFile(new URL("stirling-pdf/development/compose.yaml", root), "utf8");
  assert.ok(compose.includes("UNRESOLVED_DIGEST_DO_NOT_RUN"));
  assert.ok(!compose.includes("ports:"));
  assert.ok((await readFile(new URL("stirling-pdf/RELEASE_BLOCKED.md", root), "utf8")).includes("User License"));
});
