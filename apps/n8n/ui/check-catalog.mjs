import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { readCatalog } from "../integration/catalog.mjs";
import { scheduleConfiguration } from "../integration/configuration.mjs";

const require = createRequire(import.meta.url);
const { chromium } = require(`${process.env.SCHOLARSERVER_BROWSER_MODULES}/playwright`);
const templates = (await readCatalog(new URL("../templates/", import.meta.url))).map((template) => ({
  ...template,
  schedule: scheduleConfiguration(template)
}));
const output = new URL("../../../.dev/automation-catalog-review/", import.meta.url);
await mkdir(output, { recursive: true });
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
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const installations = {};
  const workflows = [];
  let unavailable = false;
  let attempts = 0;
  let firstIdentity;
  const applications = [
    { id: "library", workspaceId: "personal", packageId: "org.scholarserver.zotero", actions: ["research-items"] },
    { id: "notes", workspaceId: "personal", packageId: "org.scholarserver.obsidian", actions: ["create-research-note"] }
  ];
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const endpoint = url.pathname;
    let data;
    if (endpoint === "/api/status") data = { connected: true, phase: "ready" };
    else if (endpoint === "/api/v1/overview")
      data = {
        catalog: ["zotero", "obsidian", "docling"].map((id) => ({
          id: `org.scholarserver.${id}`,
          icon: { url: `/api/v1/catalog/${id}/test/icon` }
        }))
      };
    else if (endpoint.startsWith("/api/v1/catalog/")) {
      const id = endpoint.split("/")[4];
      return route.fulfill({
        contentType: "image/webp",
        body: await readFile(new URL(`../../${id}/package/assets/icons/${id}.webp`, import.meta.url))
      });
    } else if (endpoint === "/api/automations") data = { templates, installations, workflows, moreAvailable: false };
    else if (endpoint === "/api/research-applications") data = unavailable ? [] : applications;
    else if (endpoint === "/api/install") {
      const input = route.request().postDataJSON();
      attempts++;
      if (attempts === 1) {
        firstIdentity = input.automationId;
        return route.fulfill({
          status: 502,
          json: { error: "Synthetic response loss. Refresh status before continuing." }
        });
      }
      if (attempts === 2) assert.equal(input.automationId, firstIdentity);
      const workflowId = `workflow-${attempts}`;
      installations[input.automationId] = {
        ...input,
        state: "installed",
        workflowId,
        operationId: crypto.randomUUID(),
        editing: "guided",
        researchAccess: "ready",
        bindings: input.settings.research
      };
      workflows.push({ id: workflowId, name: input.name, active: false, hoursInterval: input.settings.hoursInterval });
      data = installations[input.automationId];
    } else if (endpoint === "/api/enabled") {
      const input = route.request().postDataJSON();
      workflows.find((workflow) => workflow.id === installations[input.automationId].workflowId).active = input.enabled;
      data = { enabled: input.enabled };
    } else if (endpoint === "/api/runs") data = { runs: [] };
    else throw new Error(`Unexpected test route: ${endpoint}`);
    await route.fulfill({ json: data });
  });
  await page.goto("http://127.0.0.1:18232");
  await page.getByRole("button", { name: "Browse automation catalog" }).click();
  await page.getByRole("heading", { name: "Create reading-note starters" }).waitFor();
  await page.screenshot({ path: new URL("catalog-desktop.png", output).pathname, fullPage: true });
  assert.equal(await page.getByRole("heading", { name: "Check automation execution" }).count(), 0);
  const reading = page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: "Create reading-note starters", exact: true }) });
  await reading.getByRole("button", { name: "Set up", exact: true }).click();
  await page.getByLabel("Automation name", { exact: true }).fill("My reading notes");
  await page.getByLabel("Zotero library").selectOption("personal/library");
  await page.getByLabel("Obsidian vault").selectOption("notes");
  await page.getByLabel("Notes folder").fill("../escape");
  assert.equal(await page.getByRole("button", { name: "Add automation", exact: true }).isEnabled(), false);
  await page.getByLabel("Notes folder").fill("Research/One");
  await page.getByLabel("Run every (hours)").fill("6");
  await page.getByRole("button", { name: "Add automation", exact: true }).click();
  await page.getByText("Synthetic response loss. Refresh status before continuing.", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Refresh status", exact: true }).click();
  assert.equal(await page.getByLabel("Notes folder").inputValue(), "Research/One");
  await page.getByRole("button", { name: "Add automation", exact: true }).click();
  await page.getByRole("heading", { name: "My reading notes", exact: true }).waitFor();
  await page.getByRole("button", { name: "Enable schedule", exact: true }).click();
  await page.getByRole("button", { name: "Disable schedule", exact: true }).waitFor();
  await page.reload();
  await page.getByRole("heading", { name: "My reading notes", exact: true }).waitFor();
  // ApplicationScreen navigation uses buttons, so keyboard activation shares the normal path.
  await page.getByRole("button", { name: "Catalog", exact: true }).click();
  await reading.getByRole("button", { name: "Set up", exact: true }).click();
  await page.getByLabel("Automation name", { exact: true }).fill("Second reading folder");
  await page.getByLabel("Zotero library").selectOption("personal/library");
  await page.getByLabel("Obsidian vault").selectOption("notes");
  await page.getByLabel("Notes folder").fill("Research/Two");
  await page.getByRole("button", { name: "Add automation", exact: true }).click();
  await page.getByRole("heading", { name: "Second reading folder", exact: true }).waitFor();
  assert.equal(Object.keys(installations).length, 2);
  installations[firstIdentity].editing = "customised";
  workflows[0].active = false;
  workflows.push({ id: "native", name: "Native editor workflow", active: false });
  await page.getByRole("button", { name: "Refresh status", exact: true }).click();
  const customised = page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: "My reading notes", exact: true }) });
  await customised.getByText(/Customised in n8n/).waitFor();
  assert.equal(await customised.getByRole("button", { name: "Enable schedule", exact: true }).isEnabled(), false);
  await page.getByText("Native editor workflow — Inactive", { exact: true }).waitFor();
  await page.screenshot({ path: new URL("installed-desktop.png", output).pathname, fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: new URL("installed-mobile.png", output).pathname, fullPage: true });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  unavailable = true;
  await page.getByRole("button", { name: "Refresh status", exact: true }).click();
  await page.getByRole("button", { name: "Catalog", exact: true }).click();
  await page.getByText("Not available to this platform: Zotero, Obsidian.", { exact: true }).first().waitFor();
  await page.screenshot({ path: new URL("requirements-mobile.png", output).pathname, fullPage: true });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  assert.deepEqual(errors, []);
  console.log(
    "Mocked browser passed: app roles/icons, invalid input, response-loss draft and identity retention, two independent copies, enable/reload, customisation, discovery, unavailable requirements and mobile layout."
  );
} finally {
  await browser?.close();
  preview.kill("SIGTERM");
}
