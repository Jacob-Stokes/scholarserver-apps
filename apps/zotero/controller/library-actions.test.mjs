import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createLibraryActions } from "./library-actions.mjs";

test("Docling action keeps its constrained contract outside setup logic", async () => {
  const calls = [];
  const actions = createLibraryActions({
    onlineLibrary: false,
    callBridge: async (...args) => {
      calls.push(args);
      return { state: "already-attached" };
    }
  });
  for (const input of [
    {},
    { sourceAttachmentKey: "ABCDEFGH", relativePath: "../../private.md" },
    { sourceAttachmentKey: "invalid", relativePath: ".scholarserver/docling/" + "a".repeat(64) + "/document.md" }
  ]) {
    await assert.rejects(actions.attachDoclingResult(input));
  }
  assert.equal(calls.length, 0);
  const input = {
    sourceAttachmentKey: "ABCDEFGH",
    relativePath: ".scholarserver/docling/" + "a".repeat(64) + "/document.md"
  };
  assert.deepEqual(await actions.attachDoclingResult(input), { state: "already-attached" });
  assert.deepEqual(calls[0], ["attach-docling-result", input, 120_000]);
});

test("online mode does not accidentally gain desktop-only workflow actions", async () => {
  const actions = createLibraryActions({ onlineLibrary: true });
  await assert.rejects(actions.attachDoclingResult({}), /not available yet/);
  await assert.rejects(actions.matchAttachment({ sourcePath: "paper.pdf" }), /Complete Zotero workspace/);
});

test("both variants retain MCP and its ordinary path never calls the controller", async () => {
  const source = await readFile(new URL("../mcp/src/server.ts", import.meta.url), "utf8");
  assert.match(source, /http:\/\/desktop:8082\/api/);
  assert.match(source, /https:\/\/api.zotero.org/);
  assert.doesNotMatch(source, /http:\/\/controller|callBridge/);
  const manifest = await readFile(new URL("../package/scholarserver-app.yaml", import.meta.url), "utf8");
  assert.match(manifest, /services: \[desktop, local-api-bridge, controller, automations, mcp\]/);
  assert.match(manifest, /services: \[controller, mcp\]/);
});
