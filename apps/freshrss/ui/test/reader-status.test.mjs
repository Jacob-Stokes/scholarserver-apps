import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const entryPoint = fileURLToPath(new URL("../src/reader-status.ts", import.meta.url));
const [{ text }] = (
  await build({
    entryPoints: [entryPoint],
    bundle: true,
    platform: "node",
    format: "esm",
    target: "es2022",
    write: false
  })
).outputFiles;
const { ReaderSignInRequired, readReaderJson, readerStatusPollMilliseconds } = await import(
  `data:text/javascript;base64,${Buffer.from(text).toString("base64")}`
);

test("status parser classifies access denial and login HTML without exposing upstream details", async () => {
  for (const status of [401, 403]) {
    await assert.rejects(readReaderJson(new Response("{}", { status }), "failed"), ReaderSignInRequired);
  }
  await assert.rejects(
    readReaderJson(new Response("login", { headers: { "content-type": "text/html" } }), "failed"),
    ReaderSignInRequired
  );
  await assert.rejects(readReaderJson(new Response("{}", { status: 503 }), "failed"), /failed/);
  assert.deepEqual(await readReaderJson(Response.json({ phase: "ready" }), "failed"), { phase: "ready" });
});

test("status polling checks preparation every two seconds and otherwise uses the idle cadence", () => {
  assert.equal(readerStatusPollMilliseconds(undefined), 30_000);
  assert.equal(readerStatusPollMilliseconds({ phase: "starting" }), 30_000);
  assert.equal(readerStatusPollMilliseconds({ phase: "preparing" }), 2_000);
  assert.equal(readerStatusPollMilliseconds({ phase: "ready" }), 30_000);
});
