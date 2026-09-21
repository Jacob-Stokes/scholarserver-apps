import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
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
  assert.match(source, /<SectionFeedback pending=\{loading && !error\}/);
  assert.doesNotMatch(source, /ss-card ss-loading/);
  assert.doesNotMatch(source, /ss-alert-success/);
});

test("all standalone shared-screen UIs pin the feedback icon dependency without workspace hoisting", async () => {
  const applications = await readdir(new URL("../apps/", import.meta.url), { withFileTypes: true });
  for (const application of applications) {
    if (!application.isDirectory()) continue;
    const root = new URL(`../apps/${application.name}/ui/`, import.meta.url);
    let manifest;
    try {
      manifest = JSON.parse(await readFile(new URL("package.json", root), "utf8"));
    } catch (error) {
      if (error.code === "ENOENT") continue;
      throw error;
    }
    if (!manifest.dependencies?.["@scholarserver/ui"]) continue;
    const lock = JSON.parse(await readFile(new URL("package-lock.json", root), "utf8"));
    assert.equal(manifest.dependencies["lucide-react"], "0.475.0", application.name);
    assert.equal(lock.packages[""].dependencies["lucide-react"], "0.475.0", application.name);
    assert.equal(lock.packages["node_modules/lucide-react"].version, "0.475.0", application.name);
  }
});
