import assert from "node:assert/strict";
import { createRequire } from "node:module";

// test-container.sh owns this disposable, already configured installation.
const require = createRequire(import.meta.url);
const { chromium } = require(`${process.env.SCHOLARSERVER_BROWSER_MODULES}/playwright`);
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage();
  await page.goto("http://localhost:18231");
  await page.getByLabel("Run every (hours)").fill("6");
  await page.getByRole("button", { name: "Add automation", exact: true }).click();
  await page.getByRole("button", { name: "Enable schedule", exact: true }).click();
  await page.getByRole("button", { name: "Disable schedule", exact: true }).click();
  await page.getByRole("button", { name: "Enable schedule", exact: true }).waitFor();
  await page.reload();
  await page.getByRole("button", { name: "Enable schedule", exact: true }).waitFor();
  assert.equal(await page.getByRole("button", { name: "Add automation", exact: true }).count(), 0);
  await page.getByRole("button", { name: "Show recent runs", exact: true }).click();
  await page.getByText("No recorded runs.", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Configuration", exact: true }).click();
  await page.getByRole("heading", { name: "n8n is ready" }).waitFor();
  assert.equal(await page.getByLabel("n8n API key").count(), 0);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  const missingHeader = await fetch("http://localhost:18231/api/install", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}"
  });
  assert.equal(missingHeader.status, 403);
  const removedKeyRoute = await fetch("http://localhost:18231/api/connect", {
    method: "POST",
    headers: { "content-type": "application/json", "x-requested-with": "ScholarServer" },
    body: "{}"
  });
  assert.equal(removedKeyRoute.status, 404);
  const status = await (await fetch("http://localhost:18231/api/status")).json();
  assert.deepEqual(status, { connected: true, phase: "ready" });
  console.log(
    "Native app UI passed: configured workflow, enable/disable, reload, history, Ready configuration, mobile and request boundaries."
  );
} finally {
  await browser.close();
}
