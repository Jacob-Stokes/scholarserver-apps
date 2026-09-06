// Production UI builds with synthetic APIs only. No server or account is needed.
import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const require = createRequire(import.meta.url);
const modules = process.env.SCHOLARSERVER_BROWSER_MODULES;
const { chromium } = require(modules ? `${modules}/playwright` : "playwright");
const apps = ["zotero", "obsidian", "docling", "logseq"];
const output = join(root, ".dev", "app-screens");
await mkdir(output, { recursive: true });

const server = createServer(async (request, response) => {
  const path = new URL(request.url, "http://localhost").pathname;
  const [, app, asset] = path.match(/^\/apps\/([^/]+)(?:\/assets\/([\w.-]+))?/) ?? [];
  if (!apps.includes(app) || path.includes("/api/")) {
    response.writeHead(404).end();
    return;
  }
  try {
    const file = join(root, "apps", app, "ui", "dist", asset ? `assets/${asset}` : "index.html");
    let contentType = "text/html";
    if (asset?.endsWith(".js")) contentType = "text/javascript";
    if (asset?.endsWith(".css")) contentType = "text/css";
    const content = await readFile(file);
    response.writeHead(200, { "content-type": contentType }).end(content);
  } catch {
    response.writeHead(404).end();
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;

const zoteroStatus = (online = false) => ({
  state: "account-required",
  connectionMode: online ? "online-library" : "complete-workspace",
  variant: online ? "online-library" : "complete-workspace",
  desktop: "available",
  version: "test",
  localApi: "unauthorized",
  storageMode: null,
  accountConnected: false,
  username: null,
  userId: null,
  downloadMode: "on-demand",
  groupFileSync: true,
  linkedFolder: null,
  linkedFolderAutomation: false,
  storageVerified: false,
  syncInProgress: false,
  lastError: null,
  permissions: null,
  features: { desktop: !online, automations: !online, localAttachments: !online }
});

try {
  browser = await chromium.launch({ headless: true, channel: process.env.SCHOLARSERVER_BROWSER_CHANNEL || "chrome" });
  const context = await browser.newContext({ reducedMotion: "reduce" });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  let failStatus = false;
  let failSave = false;
  let reads = 0;
  let status = zoteroStatus();
  let obsidianStatus = null;
  let selection = null;
  const calls = [];
  const option = {
    id: "private",
    transport: "tailscale",
    label: "Private Tailscale",
    url: "https://desktop.example.invalid",
    recommended: true,
    advanced: false,
    authentication: { authentik: "optional", available: true, defaultEnabled: false }
  };

  // Every request is either a local static asset or fulfilled here; even popups
  // cannot contact an external account, an installed app or a real API.
  await context.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== origin) return route.abort();
    if (!url.pathname.includes("/api/")) return route.continue();
    calls.push({ path: url.pathname, method: request.method(), body: request.postDataJSON() });
    if (url.pathname.endsWith("/client/install")) {
      assert.equal(request.postDataJSON().confirmed, true);
      obsidianStatus.officialClient.phase = "downloading";
      return route.fulfill({ json: obsidianStatus });
    }
    if (url.pathname.endsWith("/access-options")) {
      if (request.method() === "PUT") selection = { ...option, optionId: option.id, authentication: "none" };
      return route.fulfill({ json: { options: [option], selection } });
    }
    if (url.pathname.endsWith("/status")) {
      reads++;
      if (failStatus) return route.fulfill({ status: 503, json: { error: "Synthetic status unavailable" } });
      if (url.pathname.includes("/zotero/")) return route.fulfill({ json: status });
      if (url.pathname.includes("/logseq/"))
        return route.fulfill({
          json: {
            phase: "setup",
            ready: false,
            sync: "unavailable",
            graph: null,
            canRetry: false,
            accountConnected: false,
            account: { state: "idle" },
            error: null
          }
        });
      if (url.pathname.includes("/obsidian/"))
        return route.fulfill({
          json: obsidianStatus || {
            state: "ready",
            profile: "livesync",
            scopePath: "/",
            remoteVault: "Synthetic vault",
            workerRunning: true,
            lastError: null,
            lastSyncAt: null,
            liveSyncWorker: { state: "ready", running: true, lastError: null }
          }
        });
      return route.fulfill({
        json: {
          state: "ready",
          engine: "available",
          workerConcurrency: 1,
          jobs: [],
          outputFolder: "output",
          counts: { queued: 0, running: 0, succeeded: 0, failed: 0 },
          updatedAt: new Date().toISOString()
        }
      });
    }
    if (url.pathname.endsWith("/settings")) return route.fulfill({ json: { defaultOcr: false } });
    if (url.pathname.endsWith("/account/online")) {
      status = { ...status, state: "storage-required", accountConnected: true, username: "Test researcher" };
      return route.fulfill({ json: status });
    }
    if (url.pathname.endsWith("/storage") || url.pathname.endsWith("/storage/webdav")) {
      if (failSave) return route.fulfill({ status: 503, json: { error: "Synthetic save failure" } });
      const body = request.postDataJSON();
      status = {
        ...status,
        storageMode: body.storageMode ?? "webdav",
        state: status.connectionMode === "online-library" ? "ready" : "authorization-required"
      };
      return route.fulfill({ json: status });
    }
    return route.fulfill({ status: 404, json: { error: "Unexpected synthetic API request" } });
  });

  for (const app of apps) {
    const name = app[0].toUpperCase() + app.slice(1);
    for (const width of [320, 390, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`${origin}/apps/${app}/overview`);
      await page.getByRole("heading", { name, exact: true }).waitFor();
      await page.locator(".ss-loading").waitFor({ state: "hidden" });
      const navigation = page.getByRole("navigation", { name: `${name} sections` });
      await navigation.getByRole("button", { name: "Configuration", exact: true }).click();
      assert.ok(page.url().endsWith("/configuration"));
      assert.equal(
        await navigation.getByRole("button", { name: "Configuration", exact: true }).getAttribute("aria-current"),
        "page"
      );
      const dimensions = await page.evaluate(() => ({
        width: innerWidth,
        scroll: document.documentElement.scrollWidth
      }));
      assert.ok(dimensions.scroll <= dimensions.width + 1, `${app} ${width}px: no horizontal overflow`);
      if (width === 390) await page.screenshot({ path: join(output, `${app}-mobile.png`), fullPage: true });
      await page.goBack();
      assert.ok(page.url().endsWith("/overview"));
    }
    failStatus = true;
    await page.reload();
    await page.getByRole("alert").filter({ hasText: "Synthetic status unavailable" }).waitFor();
    failStatus = false;
    await page.reload();
    await page.locator(".ss-loading").waitFor({ state: "hidden" });
    console.log(`${name}: shared navigation, responsive configuration and failed-status recovery passed`);
  }

  obsidianStatus = {
    state: "client-install-required",
    profile: "official",
    scopePath: "/",
    remoteVault: "Synthetic migrated vault",
    workerRunning: false,
    lastError: null,
    officialClient: { phase: "not-installed", approvedVersion: "0.0.14", version: null, error: null }
  };
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto(`${origin}/apps/obsidian/configuration`);
  await page.getByRole("heading", { name: "Install the official sync client" }).waitFor();
  assert.equal(calls.filter((call) => call.path.endsWith("/client/install")).length, 0);
  await page.getByRole("button", { name: "Install and connect", exact: true }).click();
  await page.getByRole("progressbar", { name: "Installing Obsidian client" }).waitFor();
  await page.reload();
  await page.getByRole("progressbar", { name: "Installing Obsidian client" }).waitFor();
  obsidianStatus.officialClient.phase = "failed";
  obsidianStatus.officialClient.error = "Synthetic interrupted download";
  await page.getByRole("button", { name: "Retry installation", exact: true }).waitFor();
  await page.screenshot({ path: join(output, "obsidian-client-install-mobile.png"), fullPage: true });
  await page.getByRole("button", { name: "Retry installation", exact: true }).click();
  obsidianStatus.state = "setup-required";
  obsidianStatus.officialClient.phase = "installed";
  await page.getByRole("heading", { name: "Connect your Obsidian account" }).waitFor();
  assert.equal(calls.filter((call) => call.path.endsWith("/client/install")).length, 2);
  console.log("Obsidian: explicit download, reload during progress, failed-download retry and sign-in handover passed");
  obsidianStatus = null;

  // Online library: account -> attachment choice -> failed save -> ready -> reload.
  status = zoteroStatus(true);
  const onlineCalls = calls.length;
  await page.goto(`${origin}/apps/zotero/configuration`);
  await page.getByLabel("Zotero API key", { exact: false }).fill("synthetic-key-for-ui-test");
  await page.getByRole("button", { name: "Connect online library", exact: true }).click();
  await page.getByRole("heading", { name: "Choose attachment access", exact: true }).waitFor();
  await page.getByRole("combobox").selectOption("zotero-storage");
  failSave = true;
  await page.getByRole("button", { name: "Save and continue", exact: true }).click();
  await page.getByRole("alert").filter({ hasText: "Synthetic save failure" }).waitFor();
  assert.equal(await page.getByRole("combobox").inputValue(), "zotero-storage");
  failSave = false;
  await page.getByRole("button", { name: "Save and continue", exact: true }).click();
  await page.getByRole("heading", { name: "Zotero is connected", exact: true }).waitFor();
  await page.reload();
  await page.getByRole("heading", { name: "Zotero is connected", exact: true }).waitFor();
  assert.ok(
    !calls.slice(onlineCalls).some((call) => call.path.endsWith("/access-options")),
    "Online library never loads desktop access"
  );

  // Desktop: health polling must not replace a draft; failed saves retain the
  // synthetic password, successful saves clear it, and access precedes authorization.
  status = { ...zoteroStatus(), state: "storage-required", accountConnected: true };
  await page.goto(`${origin}/apps/zotero/configuration`);
  await page.getByRole("combobox").first().selectOption("webdav");
  await page.getByLabel("WebDAV URL", { exact: true }).fill("https://dav.example.invalid/test");
  await page.getByLabel("WebDAV username", { exact: true }).fill("synthetic-user");
  const password = page.getByLabel("WebDAV password", { exact: false });
  await password.fill("synthetic-password");
  const beforePoll = reads;
  await page.waitForTimeout(5500);
  assert.ok(reads > beforePoll, "Health polling ran while the form was being edited");
  assert.equal(await password.inputValue(), "synthetic-password");
  assert.equal(await page.getByRole("combobox").first().inputValue(), "webdav");
  failSave = true;
  await page.getByRole("button", { name: "Save and continue", exact: true }).click();
  await page.getByRole("alert").filter({ hasText: "Synthetic save failure" }).waitFor();
  assert.equal(await password.inputValue(), "synthetic-password");
  failSave = false;
  await page.getByRole("button", { name: "Save and continue", exact: true }).click();
  await page.getByRole("heading", { name: "Choose how to open Zotero Desktop", exact: true }).waitFor();
  await page.getByRole("button", { name: "Back", exact: true }).click();
  assert.equal(await password.inputValue(), "");
  await password.fill("synthetic-password");
  await page.getByRole("button", { name: "Save and continue", exact: true }).click();
  await page.getByRole("button", { name: "Use this address", exact: true }).click();
  await page.getByRole("heading", { name: "Authorize ScholarServer", exact: true }).waitFor();
  assert.deepEqual(calls.findLast((call) => call.method === "PUT").body, {
    optionId: "private",
    authentication: "none"
  });
  assert.deepEqual(errors, [], "No browser runtime errors");
  console.log(
    "Zotero: both setup modes, save failures, polling/draft preservation, password clearing and resume passed"
  );
} finally {
  await browser?.close();
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}
