// Compiled workspaces with synthetic APIs only. Manager destinations are placeholders;
// native Manager forms are checked by core's application-configuration preview suite.
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { createAppWorkspacePreview } from "./app-workspace-preview.mjs";

const require = createRequire(import.meta.url);
const modules = process.env.SCHOLARSERVER_BROWSER_MODULES;
const { chromium } = require(modules ? `${modules}/playwright` : "playwright");
const { expect } = require(modules ? `${modules}/playwright/test` : "playwright/test");
const preview = await createAppWorkspacePreview();
const { origin, state, workspaceRoutes } = preview;
const output = new URL("../.dev/app-workspaces/", import.meta.url);
await mkdir(output, { recursive: true });
let browser;
try {
  const options = { headless: true };
  if (process.env.SCHOLARSERVER_BROWSER_EXECUTABLE)
    options.executablePath = process.env.SCHOLARSERVER_BROWSER_EXECUTABLE;
  else options.channel = process.env.SCHOLARSERVER_BROWSER_CHANNEL || "chrome";
  browser = await chromium.launch(options);
  const context = await browser.newContext({ reducedMotion: "reduce" });
  await context.route("**/*", (route) =>
    new URL(route.request().url()).origin === origin ? route.continue() : route.abort()
  );
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));

  for (const app of ["obsidian", "logseq", "freshrss", "zotero", "docling", "n8n"]) {
    const before = state.calls.length;
    await page.goto(`${origin}/apps/${app}-two/configuration`);
    await expect(page).toHaveURL(`${origin}/applications/manage/${app}-two/configuration`);
    await expect(page.getByRole("heading", { name: "Manager navigation target" })).toBeVisible();
    assert.equal(state.calls.length, before, `${app}: no standalone configuration API reads`);
    await page.goto(`${origin}/apps/${app}-two/overview`);
    const overview = app === "n8n" ? `/automations?engine=${app}-two` : `/applications/manage/${app}-two`;
    await expect(page).toHaveURL(`${origin}${overview}`);
    assert.equal(state.calls.length, before);
  }

  for (const width of [320, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    for (const [app, path] of Object.entries(workspaceRoutes)) {
      state.scenario = "ready";
      state.installations = {};
      await page.goto(`${origin}${path}`);
      const landmark = app === "zotero" ? "Check attachment access" : "Process one PDF";
      if (app === "n8n")
        await expect(page.getByRole("textbox", { name: "Automation name", exact: true })).toBeVisible();
      else await expect(page.getByRole("heading", { name: landmark, exact: true })).toBeVisible();
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${app} ${width}px`);
      if (width === 390) await page.screenshot({ path: new URL(`${app}-mobile.png`, output).pathname, fullPage: true });
    }
  }

  state.scenario = "failed-write";
  await page.goto(`${origin}${workspaceRoutes.zotero}`);
  const attachment = page.getByRole("textbox", { name: "Attachment key", exact: true });
  await attachment.fill("ABCD1234");
  await page.getByRole("button", { name: "Resolve", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Synthetic write failure");
  await expect(attachment).toHaveValue("ABCD1234");
  state.scenario = "ready";
  await page.getByRole("button", { name: "Resolve", exact: true }).click();
  await expect(page.locator("pre")).toContainText("ABCD1234");
  state.scenario = "online";
  await page.reload();
  await expect(page.getByRole("heading", { name: "How online files work" })).toBeVisible();
  assert.equal(await page.getByRole("button", { name: "Find match" }).count(), 0);
  state.scenario = "denied";
  await page.reload();
  await expect(page.getByText("Open ScholarServer and sign in again, then retry.")).toBeVisible();
  assert.equal(await attachment.count(), 0);
  assert.equal(await page.locator("pre").count(), 0);
  state.scenario = "ready";
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(attachment).toHaveValue("");
  await page.getByRole("button", { name: "Configuration", exact: true }).click();
  await expect(page).toHaveURL(`${origin}/applications/manage/zotero/configuration`);

  state.scenario = "missing-defaults";
  await page.goto(`${origin}${workspaceRoutes.docling}`);
  await expect(page.getByText("Could not load conversion defaults.", { exact: false })).toBeVisible();
  const queue = page.getByRole("button", { name: "Queue this PDF", exact: true });
  await expect(queue).toBeDisabled();
  const ocr = page.getByRole("checkbox", { name: /^Use OCR/ });
  await ocr.check();
  await ocr.uncheck();
  await expect(queue).toBeEnabled();
  state.scenario = "ready";
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(page.getByText("Could not load conversion defaults.", { exact: false })).not.toBeVisible();
  await expect(ocr).not.toBeChecked();
  const key = page.getByRole("textbox", { name: /Zotero attachment key/ });
  await key.fill("ABCD1234");
  state.scenario = "failed-write";
  await queue.click();
  await expect(page.getByRole("alert")).toContainText("Synthetic write failure");
  await expect(key).toHaveValue("ABCD1234");
  await expect(ocr).not.toBeChecked();
  state.scenario = "ready";
  await queue.click();
  await expect(page.getByText("The PDF was added to the queue.", { exact: true })).toBeVisible();
  assert.equal(state.jobs.at(-1).ocr, false);
  await page.getByRole("button", { name: "Queue", exact: true }).click();
  await expect(page.getByText("Papers/synthetic.pdf", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Configuration", exact: true }).click();
  await expect(page).toHaveURL(`${origin}/applications/manage/docling/configuration`);

  state.scenario = "failed-write";
  state.installations = {};
  await page.goto(`${origin}${workspaceRoutes.n8n}`);
  const name = page.getByRole("textbox", { name: "Automation name", exact: true });
  await name.fill("Synthetic retained draft");
  await page.getByRole("combobox", { name: "Zotero library", exact: true }).selectOption("personal/zotero");
  await page.getByRole("combobox", { name: "Obsidian vault", exact: true }).selectOption("obsidian");
  const folder = page.getByRole("textbox", { name: "Notes folder", exact: true });
  await folder.fill("Research/Synthetic");
  const add = page.getByRole("button", { name: "Add automation", exact: true });
  await add.click();
  await expect(page.getByRole("alert")).toContainText("Synthetic write failure");
  await expect(name).toHaveValue("Synthetic retained draft");
  await expect(folder).toHaveValue("Research/Synthetic");
  const first = state.calls.filter((call) => call.path.endsWith("/api/install")).at(-1);
  state.scenario = "ready";
  await add.click();
  await expect(page.getByRole("heading", { name: "Automation added", exact: true })).toBeVisible();
  const accepted = state.calls.filter((call) => call.path.endsWith("/api/install")).at(-1);
  assert.equal(accepted.input.automationId, first.input.automationId);
  assert.equal(Object.keys(state.installations).length, 1);
  const beforeReload = state.calls.filter((call) => call.path.endsWith("/api/install")).length;
  await page.reload();
  await expect(name).toBeVisible();
  assert.equal(state.calls.filter((call) => call.path.endsWith("/api/install")).length, beforeReload);
  state.scenario = "missing-permission";
  await page.reload();
  await expect(page.getByText("Allow research app access in n8n Configuration before choosing apps.")).toBeVisible();
  await expect(add).toBeDisabled();
  state.scenario = "setup";
  await page.reload();
  await expect(page.getByRole("heading", { name: "n8n state needs recovery" })).toBeVisible();
  assert.equal(await page.getByRole("textbox", { name: "Automation name", exact: true }).count(), 0);
  assert.deepEqual(errors, []);
  console.log(
    "PASS: all six Manager redirects; retained workspaces at 320/390/768/1280px; draft preservation, defaults, failed writes, access denial, explicit retry and no replay on reload. Synthetic data only."
  );
} finally {
  await browser?.close();
  await preview.close();
}
