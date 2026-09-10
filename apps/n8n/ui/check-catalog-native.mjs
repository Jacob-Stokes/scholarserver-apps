// Run only against test-container.sh's loopback-only disposable installation.
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require(`${process.env.SCHOLARSERVER_BROWSER_MODULES}/playwright`);
const output = new URL("../../../.dev/automation-catalog-review/", import.meta.url);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto("http://127.0.0.1:18231");
  await page.getByRole("button", { name: "Catalog", exact: true }).click();
  const reading = page.locator("section").filter({
    has: page.getByRole("heading", { name: "Create reading-note starters", exact: true })
  });
  await reading.getByRole("button", { name: "Set up", exact: true }).click();
  await page.getByLabel("Automation name", { exact: true }).fill("Browser acceptance reading notes");
  await page.getByLabel("Zotero library").selectOption("personal/zotero");
  await page.getByLabel("Obsidian vault").selectOption("obsidian");
  await page.getByLabel("Notes folder").fill("Research/Browser");
  await page.getByLabel("Run every (hours)").fill("12");
  await page.getByRole("button", { name: "Add automation", exact: true }).click();
  const created = page.locator("section").filter({
    has: page.getByRole("heading", { name: "Browser acceptance reading notes", exact: true })
  });
  await created.getByRole("button", { name: "Enable schedule", exact: true }).waitFor();
  await created.getByRole("button", { name: "Enable schedule", exact: true }).click();
  await created.getByRole("button", { name: "Disable schedule", exact: true }).click();
  await page.reload();
  await created.getByRole("button", { name: "Enable schedule", exact: true }).waitFor();
  await created.getByRole("button", { name: "Show recent runs", exact: true }).click();
  await created.getByText(/No recorded runs/).waitFor();
  await page.screenshot({ path: new URL("native-installed-desktop.png", output).pathname, fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.screenshot({ path: new URL("native-installed-mobile.png", output).pathname, fullPage: true });
  const inventory = await page.request.get("http://127.0.0.1:18231/api/automations");
  const data = await inventory.json();
  const matches = Object.values(data.installations).filter(
    (receipt) => receipt.name === "Browser acceptance reading notes"
  );
  assert.equal(matches.length, 1);
  assert.equal(matches[0].bindings.folder, "Research/Browser");
  assert.equal(matches[0].editing, "guided");
  assert.equal(data.workflows.find((workflow) => workflow.id === matches[0].workflowId).active, false);
  console.log(
    "Native browser passed: real n8n workflow and credential creation, scoped folder, enable/disable, reload, run listing and mobile layout. Research apps are synthetic fixtures."
  );
} finally {
  await browser.close();
}
