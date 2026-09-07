import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { AnkiClient } from "../dist/client.js";
import { ankiTools } from "../dist/tools.js";

const key = "synthetic-key-000000000000000000000000";
async function fixture(t) {
  const directory = await mkdtemp(path.join(tmpdir(), "anki-synthetic-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return path.join(directory, "pending");
}
function response(value) {
  return new Response(JSON.stringify({ result: value, error: null }));
}

test("read API sends version/key in body, refuses redirects and disallows destructive operations", async (t) => {
  let calls = 0;
  const client = new AnkiClient("http://desktop:8765", key, await fixture(t), false, async (url, init) => {
    calls++;
    assert.equal(init.redirect, "error");
    assert.equal(JSON.parse(init.body).key, key);
    assert.equal(JSON.parse(init.body).version, 6);
    assert.ok(init.signal);
    return response(6);
  });
  assert.equal(await client.invoke("version"), 6);
  for (const operation of ["sync", "deleteNotes", "updateNoteFields", "importPackage", "multi", "loadProfile"]) {
    await assert.rejects(client.invoke(operation), /not enabled/);
  }
  await assert.rejects(client.invoke("addNote"), /operator/);
  assert.equal(calls, 1);
});

test("busy requests are rejected rather than queued", async (t) => {
  let finish;
  const client = new AnkiClient(
    "http://desktop:8765",
    key,
    await fixture(t),
    false,
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  const first = client.invoke("version");
  await assert.rejects(client.invoke("version"), /busy/);
  finish(response(6));
  await first;
});

test("uncertain write blocks another process and survives restart without recording note data", async (t) => {
  const marker = await fixture(t);
  let calls = 0;
  const request = async () => {
    calls++;
    throw new Error("secret upstream text");
  };
  const client = new AnkiClient("http://desktop:8765", key, marker, true, request);
  await assert.rejects(client.invoke("addNote", { note: { fields: { Front: "private synthetic text" } } }), /unknown/);
  assert.equal(await readFile(marker, "utf8"), '{"operation":"addNote","outcome":"unknown"}\n');
  const restarted = new AnkiClient("http://desktop:8765", key, marker, true, request);
  await assert.rejects(restarted.invoke("addNote"), /pending operation/);
  assert.equal(calls, 1);
});

test("successful creation clears the marker; malformed results stay blocked", async (t) => {
  const marker = await fixture(t);
  const client = new AnkiClient("http://desktop:8765", key, marker, true, async () => response(123));
  assert.equal(await client.invoke("addNote"), 123);
  await assert.rejects(readFile(marker), { code: "ENOENT" });
  const invalid = new AnkiClient("http://desktop:8765", key, marker, true, async () => response(null));
  await assert.rejects(invalid.invoke("addNote"), /unknown/);
  assert.ok(await readFile(marker));
});

test("oversized response and backend errors are bounded and redacted", async (t) => {
  const marker = await fixture(t);
  for (const result of [
    new Response("x".repeat(1_048_577)),
    new Response('{"result":null,"error":"SECRET"}'),
    new Response("bad json")
  ]) {
    const client = new AnkiClient("http://desktop:8765", key, marker, false, async () => result);
    await assert.rejects(
      client.invoke("version"),
      (error) => !error.message.includes("SECRET") && /could not complete/.test(error.message)
    );
  }
});

test("tools enforce narrow inputs, namespace and duplicate rejection", async () => {
  let received;
  const client = {
    invoke: async (...args) => {
      received = args;
      return 123;
    }
  };
  const readTools = ankiTools(client);
  assert.equal(readTools.length, 5);
  assert.ok(readTools.every((tool) => tool.def.name.startsWith("anki_") && tool.def.annotations.readOnlyHint));
  const add = ankiTools(client, true).at(-1);
  const input = add.def.inputSchema.parse({
    deck: "Synthetic",
    model: "Basic",
    fields: { Front: "Question", Back: "Answer" }
  });
  await add.handler(input);
  assert.equal(received[0], "addNote");
  assert.equal(received[1].note.options.allowDuplicate, false);
  assert.equal(add.def.inputSchema.safeParse({ ...input, overwrite: true }).success, false);
  assert.equal(add.def.inputSchema.safeParse({ ...input, fields: {} }).success, false);
});

test("deadline aborts a stalled request and retains an uncertain write marker", async (t) => {
  const marker = await fixture(t);
  const request = async (_url, init) =>
    new Promise((_resolve, reject) => {
      init.signal.addEventListener("abort", () => reject(new Error("synthetic timeout")), { once: true });
    });
  // AbortSignal's timer is unref'ed; keep this synthetic stalled request alive.
  const keepAlive = setInterval(() => {}, 100);
  try {
    const client = new AnkiClient("http://desktop:8765", key, marker, true, request, 20);
    await assert.rejects(client.invoke("addNote"), /unknown/);
    assert.ok(await readFile(marker));
  } finally {
    clearInterval(keepAlive);
  }
});
