import assert from "node:assert/strict";
import { createRequire } from "node:module";

// test-container.sh owns this disposable, already configured installation.
const require = createRequire(import.meta.url);
const { chromium } = require(`${process.env.SCHOLARSERVER_BROWSER_MODULES}/playwright`);
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage();
  const origin = "http://localhost:18231";
  await page.goto(`${origin}/automation-setup?managerSetup=1&templateId=connection-check`);
  await page.getByLabel("Run every (hours)").fill("6");
  await page.getByRole("button", { name: "Add automation", exact: true }).click();
  await page.getByRole("heading", { name: "Automation added", exact: true }).waitFor();
  const inventory = await (await fetch(`${origin}/api/automations`)).json();
  const diagnostics = Object.entries(inventory.installations).filter(
    ([, receipt]) => receipt.templateId === "connection-check"
  );
  assert.equal(diagnostics.length, 1);
  const [automationId, receipt] = diagnostics[0];
  assert.equal(receipt.state, "installed");
  for (const enabled of [true, false]) {
    const response = await fetch(`${origin}/api/enabled`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-requested-with": "ScholarServer" },
      body: JSON.stringify({ automationId, enabled })
    });
    assert.equal(response.status, 200);
  }
  await page.reload();
  assert.equal(Object.keys((await (await fetch(`${origin}/api/automations`)).json()).installations).length, 1);
  await page.goto(`${origin}/automation-setup?managerSetup=1`);
  await page.getByRole("heading", { name: "n8n is ready", exact: true }).waitFor();
  assert.equal(await page.getByRole("button", { name: "Catalog", exact: true }).count(), 0);
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
  assert.deepEqual(status, { connected: true, phase: "ready", automationInterfaceVersion: 1 });
  console.log(
    "Native embedded UI passed: diagnostic installation, reload without replay, ready/mobile presentation and request boundaries; enable/disable checked through the integration API."
  );
} finally {
  await browser.close();
}
