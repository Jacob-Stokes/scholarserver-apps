// Source UI acceptance with synthetic APIs and one isolated browser. No Docker,
// native app profiles, Zotero cloud requests or real library changes are used.
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const root = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(import.meta.url);
const modules = process.env.SCHOLARSERVER_BROWSER_MODULES;
const { chromium } = require(modules ? `${modules}/playwright` : "playwright");
const output = path.join(root, ".dev", "zotero-setup-boundary");
await mkdir(output, { recursive: true });
const server = await createServer({
  root: path.join(root, "apps/zotero/ui"),
  server: { host: "127.0.0.1", port: 0 },
  logLevel: "error"
});
let browser;
try {
  await server.listen();
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  browser = await chromium.launch({ headless: true, channel: "chrome" });
  const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  const failures = [];
  let status = {
    state: "account-required",
    connectionMode: "complete-workspace",
    variant: "complete-workspace",
    desktop: "available",
    version: "synthetic",
    localApi: "read-only",
    storageMode: null,
    accountConnected: false,
    username: null,
    userId: null,
    downloadMode: "on-demand",
    groupFileSync: false,
    linkedFolder: null,
    linkedFolderAutomation: false,
    storageVerified: false,
    syncInProgress: false,
    lastError: null,
    permissions: null,
    features: { desktop: true, automations: true, localAttachments: true }
  };
  let session = { state: "idle" };
  let starts = 0;
  let authorization;
  let selectedUrl = `${origin}/test-desktop`;
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin === "https://www.zotero.org") {
      return route.fulfill({
        contentType: "text/html",
        body: "<p>Synthetic Zotero website sign-in — no account connection</p>"
      });
    }
    if (url.origin !== origin) {
      failures.push(`Unexpected external request: ${url.origin}`);
      return route.abort();
    }
    if (url.pathname === "/test-desktop")
      return route.fulfill({
        contentType: "text/html",
        body: "<h1>Synthetic Zotero permission dialog</h1><p>Allow ScholarServer?</p><button>Always Allow</button>"
      });
    if (url.pathname.endsWith("/access-options"))
      return route.fulfill({
        json: {
          options: [
            {
              id: "private",
              transport: "tailscale",
              recommended: true,
              authentication: { authentik: "unsupported", available: false, defaultEnabled: false }
            }
          ],
          selection: {
            optionId: "private",
            transport: "tailscale",
            url: selectedUrl,
            authentication: "none",
            updatedAt: "2026-09-12T00:00:00Z"
          }
        }
      });
    if (url.pathname === "/apps/zotero/api/status") return route.fulfill({ json: status });
    if (url.pathname === "/apps/zotero/api/account/session") return route.fulfill({ json: session });
    if (url.pathname === "/apps/zotero/api/account/start") {
      starts++;
      session = { state: "pending", loginUrl: "https://www.zotero.org/login/session?session=synthetic" };
      return route.fulfill({ json: session });
    }
    if (url.pathname === "/apps/zotero/api/storage") {
      status = { ...status, ...route.request().postDataJSON(), state: "authorization-required" };
      return route.fulfill({ json: status });
    }
    if (url.pathname === "/apps/zotero/api/authorize") {
      authorization = route;
      return;
    }
    if (url.pathname.includes("/api/")) {
      failures.push(`Unexpected API request: ${url.pathname}`);
      return route.fulfill({ status: 404, json: { error: "Unknown synthetic route" } });
    }
    return route.continue();
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => failures.push(error.message));
  const url = `${origin}/apps/zotero/configuration`;
  await page.goto(url);
  await page.getByRole("button", { name: "Connect Zotero account", exact: true }).click();
  await page.getByText("Complete sign-in on Zotero’s website.", { exact: false }).waitFor();
  await page.reload();
  await page.getByRole("link", { name: "Open Zotero sign-in" }).waitFor();
  assert.equal(starts, 1, "reload must resume, not start another login");
  await page.screenshot({ path: path.join(output, "01-login-resumed.png"), fullPage: true });
  session = { state: "cancelled" };
  await page.getByText("Zotero sign-in was cancelled.", { exact: false }).waitFor();
  assert.equal(await page.getByText("Your Zotero account is connected.", { exact: true }).count(), 0);
  await page.getByRole("button", { name: "Connect Zotero account", exact: true }).click();
  session = { state: "connected" };
  status = {
    ...status,
    state: "storage-required",
    accountConnected: true,
    username: "Synthetic researcher",
    userId: "123"
  };
  await page.getByRole("heading", { name: "Choose where attachments live" }).waitFor();
  await page.getByRole("button", { name: "Save and continue" }).click();
  await page.getByRole("button", { name: "Request access", exact: true }).click();
  await page.getByTitle("Zotero permission approval").waitFor();
  await page.frameLocator('iframe[title="Zotero permission approval"]').getByRole("heading").waitFor();
  await page.screenshot({ path: path.join(output, "02-guided-approval.png"), fullPage: true });
  await authorization.fulfill({ status: 400, json: { error: "Zotero authorization was denied" } });
  await page.getByText("Zotero authorization was denied", { exact: true }).waitFor();
  assert.equal(await page.getByTitle("Zotero permission approval").count(), 1, "failure keeps recovery visible");
  authorization = null;
  await page.getByRole("button", { name: "Request access", exact: true }).click();
  await page.waitForFunction(() => document.body.textContent.includes("Waiting for your approval"));
  const authorizationDeadline = Date.now() + 5000;
  while (!authorization && Date.now() < authorizationDeadline) await new Promise((resolve) => setTimeout(resolve, 20));
  assert.ok(authorization, "the approval retry must reach the synthetic API");
  status = { ...status, state: "ready", localApi: "authorized" };
  await authorization.fulfill({ json: status });
  await page.getByRole("heading", { name: "Zotero is connected" }).waitFor();
  assert.equal(await page.getByTitle("Zotero permission approval").count(), 0);
  await page.getByRole("button", { name: "Run initial sync" }).waitFor();
  await page.screenshot({ path: path.join(output, "03-connection-checks.png"), fullPage: true });
  selectedUrl = "https://protected-desktop.example/";
  status = { ...status, state: "authorization-required", localApi: "read-only" };
  await page.goto(url);
  await page.getByRole("heading", { name: "Approve ScholarServer in Zotero" }).waitFor();
  assert.equal(await page.getByRole("button", { name: "Show Zotero view" }).count(), 0);
  assert.ok(await page.getByRole("link", { name: "Open Zotero in a separate tab" }).getAttribute("href"));
  assert.deepEqual(failures, []);
  console.log(
    `PASS: login resume/cancellation, website sign-in, approval failure/retry, same-origin panel and cross-origin fallback. Screenshots: ${output}`
  );
} finally {
  await browser?.close();
  await server.close();
}
