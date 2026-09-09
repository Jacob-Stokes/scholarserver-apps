import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require(`${process.env.SCHOLARSERVER_BROWSER_MODULES}/playwright`);
const preview = spawn("npm", ["run", "preview", "--", "--host", "127.0.0.1", "--port", "18232", "--strictPort"], {
  cwd: new URL("./", import.meta.url),
  stdio: "pipe"
});
let browser;
try {
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Preview did not start")), 15000);
    preview.once("exit", () => {
      clearTimeout(timeout);
      reject(new Error("Preview exited"));
    });
    preview.stdout.on("data", (value) => {
      if (value.toString().includes("127.0.0.1:18232")) {
        clearTimeout(timeout);
        resolve();
      }
    });
  });
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  let attempts = 0;
  let installed = false;
  await page.route("**/api/**", async (route) => {
    const endpoint = new URL(route.request().url()).pathname;
    let data;
    if (endpoint === "/api/status") data = { connected: true };
    else if (endpoint === "/api/automations")
      data = {
        templates: [
          {
            id: "connection-check",
            name: "Check execution",
            description: "Test only",
            schedule: { hoursInterval: 1, minimum: 1, maximum: 168 }
          }
        ],
        installations: installed
          ? { "connection-check": { state: "installed", workflowId: "test", operationId: "operation" } }
          : {},
        workflows: installed ? [{ id: "test", name: "Check execution", active: false }] : [],
        moreAvailable: false
      };
    else if (endpoint === "/api/install") {
      assert.equal(route.request().postDataJSON().settings.hoursInterval, 6);
      attempts++;
      if (attempts === 1) return route.fulfill({ status: 502, json: { error: "Test connection unavailable" } });
      installed = true;
      data = { state: "installed" };
    } else throw new Error(`Unexpected test request: ${endpoint}`);
    await route.fulfill({ json: data });
  });
  await page.goto("http://127.0.0.1:18232");
  const interval = page.getByLabel("Run every (hours)");
  await interval.fill("6");
  await page.getByRole("button", { name: "Add automation", exact: true }).click();
  await page.getByText("Test connection unavailable", { exact: true }).waitFor();
  assert.equal(await interval.inputValue(), "6");
  await page.getByRole("button", { name: "Refresh status", exact: true }).click();
  assert.equal(await interval.inputValue(), "6");
  await page.getByRole("button", { name: "Add automation", exact: true }).click();
  await page.getByRole("button", { name: "Enable schedule", exact: true }).waitFor();
  assert.equal(attempts, 2);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  console.log("Mocked browser: failed-save draft preservation, refresh, configured install and mobile width passed.");
} finally {
  await browser?.close();
  preview.kill("SIGTERM");
}
