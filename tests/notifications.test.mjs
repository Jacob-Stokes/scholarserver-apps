import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("each independently built application UI pins the shared toast runtime in its own lockfile", async () => {
  for (const app of ["n8n", "freshrss", "docling", "obsidian", "zotero", "logseq"]) {
    const root = new URL(`../apps/${app}/ui/`, import.meta.url);
    const manifest = JSON.parse(await readFile(new URL("package.json", root), "utf8"));
    const lock = JSON.parse(await readFile(new URL("package-lock.json", root), "utf8"));
    assert.equal(manifest.dependencies.sonner, "2.0.7", app);
    assert.equal(lock.packages["node_modules/sonner"].version, "2.0.7", app);
  }
});

test("shared screen retains inline errors and loading but uses one toast host for notices", async () => {
  const source = await readFile(new URL("../vendor/scholarserver-ui/application-screen.tsx", import.meta.url), "utf8");
  assert.equal(source.match(/<Notifications \/>/g)?.length, 1);
  assert.match(source, /<SuccessNotice message=\{notice\} \/>/);
  assert.match(source, /ss-alert-error/);
  assert.match(source, /ss-loading/);
  assert.doesNotMatch(source, /ss-alert-success/);
});
