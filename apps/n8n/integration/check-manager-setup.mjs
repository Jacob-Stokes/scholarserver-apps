import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { createRequire } from "node:module";

// Install an isolated disposable instance through Manager first. This test does
// not select or reset an existing owner's account, nor read browser credentials.
const origin = process.env.SCHOLARSERVER_TEST_MANAGER;
const instanceId = process.env.SCHOLARSERVER_TEST_INSTANCE;
assert.ok(origin && new URL(origin).protocol === "https:");
assert.match(instanceId ?? "", /^n8n-setup-acceptance-[a-z0-9-]+$/);
const base = `${origin}/apps/${instanceId}`;
assert.equal((await (await fetch(`${base}/api/status`)).json()).phase, "password-required");
const require = createRequire(import.meta.url);
const { chromium } = require(`${process.env.SCHOLARSERVER_BROWSER_MODULES}/playwright`);
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto(`${base}/`);
  await page.getByRole("heading", { name: "Set your n8n password", exact: true }).waitFor();
  assert.equal(await page.getByLabel("n8n API key").count(), 0);
  const password = `Check9${randomBytes(24).toString("hex")}`;
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("Confirm password", { exact: true }).fill(`${password}x`);
  assert.equal(await page.getByRole("button", { name: "Finish installation" }).isEnabled(), false);
  await page.getByLabel("Confirm password", { exact: true }).fill(password);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  const actionResponse = page.waitForResponse((response) => response.url().endsWith("/actions/setup"));
  await page.getByRole("button", { name: "Finish installation" }).click();
  const result = await actionResponse;
  assert.equal(result.ok(), true, "The real Manager/executor setup action must succeed");
  await page.getByRole("heading", { name: "Automation catalog", exact: true }).waitFor();
  await page.getByLabel("Run every (hours)").fill("6");
  await page.getByRole("button", { name: "Add automation", exact: true }).click();
  await page.getByRole("button", { name: "Enable schedule", exact: true }).click();
  await page.getByRole("button", { name: "Disable schedule", exact: true }).click();
  await page.getByRole("button", { name: "Enable schedule", exact: true }).waitFor();
  await page.reload();
  await page.getByRole("button", { name: "Enable schedule", exact: true }).waitFor();
  await page.getByRole("button", { name: "Configuration", exact: true }).click();
  await page.getByRole("heading", { name: "n8n is ready" }).waitFor();
  assert.equal(await page.locator('input[type="password"]').count(), 0);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await page.screenshot({ path: "/tmp/n8n-manager-password-ready.png" });
  console.log(
    "Real Manager/executor mobile acceptance passed: password-only setup, workflow installation, enable/disable, reload and Ready configuration."
  );
} finally {
  await browser.close();
}
