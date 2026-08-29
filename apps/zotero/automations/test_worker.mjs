import assert from "node:assert/strict";
import { mkdtemp, mkdir, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const root = await mkdtemp(path.join(os.tmpdir(), "scholarserver-zotero-automations-"));
process.env.SCHOLARSERVER_LINKED_ROOT = root;
const { browseFolders, validateAutomationUpdate, validateConfiguration } = await import("./worker.mjs");

test("validates the bundled PDF conversion settings", () => {
  assert.deepEqual(validateConfiguration({ folder: "Papers/History", limit: 3, ocr: false, attachMarkdown: true }), {
    folder: "Papers/History", limit: 3, ocr: false, attachMarkdown: true
  });
  assert.throws(() => validateConfiguration({ folder: "../private", limit: 3, ocr: false, attachMarkdown: true }), /stay inside/);
  assert.throws(() => validateConfiguration({ folder: "", limit: 0, ocr: false, attachMarkdown: true }), /between 1 and 100/);
});

test("folder browser is bounded to visible shared-storage directories", async () => {
  await mkdir(path.join(root, "Papers", "History"), { recursive: true });
  await mkdir(path.join(root, ".scholarserver"), { recursive: true });
  await writeFile(path.join(root, "paper.pdf"), "fixture");
  await symlink(os.tmpdir(), path.join(root, "escape"));
  assert.deepEqual(await browseFolders(""), {
    path: "", parent: null, folders: [{ name: "Papers", path: "Papers" }]
  });
  assert.deepEqual(await browseFolders("Papers"), {
    path: "Papers", parent: "", folders: [{ name: "History", path: "Papers/History" }]
  });
  await assert.rejects(() => browseFolders("../"), /stay inside/);
});

test("activation is independent from scheduling and deactivation stops schedules", () => {
  const configuration = { folder: "", limit: 3, ocr: false, attachMarkdown: true };
  assert.deepEqual(validateAutomationUpdate({ active: true, enabled: false, intervalMinutes: 60, configuration }), {
    active: true, enabled: false, intervalMinutes: 60, configuration
  });
  assert.deepEqual(validateAutomationUpdate({ active: false, enabled: true, intervalMinutes: 60, configuration }), {
    active: false, enabled: false, intervalMinutes: 60, configuration
  });
  assert.throws(() => validateAutomationUpdate({ enabled: false, intervalMinutes: 60, configuration }), /Activation state/);
});
