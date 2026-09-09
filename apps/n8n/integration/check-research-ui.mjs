import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require(`${process.env.SCHOLARSERVER_BROWSER_MODULES}/playwright`);
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto("http://localhost:18231");
  const card = page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: "Zotero reading notes", exact: true }) });
  await card.getByText("Choose apps and schedule", { exact: true }).click();
  await card.getByLabel("Zotero library").selectOption("personal/zotero");
  await card.getByLabel("Obsidian vault").selectOption("obsidian");
  await card.getByLabel("Notes folder").fill("../escape");
  assert.equal(await card.getByRole("button", { name: "Add automation" }).isEnabled(), false);
  await card.getByLabel("Notes folder").fill("Research");
  await page.route("**/api/install", (route) => route.abort());
  await card.getByRole("button", { name: "Add automation" }).click();
  await page.getByRole("button", { name: "Refresh status", exact: true }).click();
  assert.equal(await card.getByLabel("Notes folder").inputValue(), "Research");
  assert.equal(await card.getByLabel("Obsidian vault").inputValue(), "obsidian");
  await page.unroute("**/api/install");
  await card.getByRole("button", { name: "Add automation" }).click();
  await card.getByRole("button", { name: "Enable schedule", exact: true }).waitFor();
  await page.reload();
  await card.getByRole("button", { name: "Enable schedule", exact: true }).waitFor();
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.screenshot({ path: "/tmp/n8n-research-mobile.png", fullPage: true });
  console.log(
    "Research form passed: scoped selections, invalid path, failed-save draft retention, native install, disabled schedule, reload and mobile width."
  );
} finally {
  await browser.close();
}
