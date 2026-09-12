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
  const cards = page.locator(".automation-template");
  await page.getByRole("searchbox", { name: "Search automations" }).waitFor();
  await page.getByRole("heading", { name: "Automatically convert new Zotero PDFs" }).waitFor();
  assert.equal(await cards.count(), 6);
  const cardNames = [
    "Create reading-note starters",
    "Create a weekly reading roundup",
    "Check references for missing details",
    "Create a Markdown bibliography",
    "Create a daily list of new papers",
    "Automatically convert new Zotero PDFs"
  ];
  for (const cardName of cardNames) {
    assert.equal(
      await cards.filter({ has: page.getByRole("heading", { name: cardName, exact: true }) }).count(),
      1,
      `catalog should contain ${cardName}`
    );
  }
  const catalogResponse = await page.request.get("http://127.0.0.1:18231/api/automations");
  const catalogData = await catalogResponse.json();
  const newResearchTemplates = catalogData.templates.filter((template) =>
    ["weekly-roundup", "reference-audit", "bibliography"].includes(template.research)
  );
  assert.equal(newResearchTemplates.length, 3);
  await page.locator(".catalog-tag-picker summary").click();
  for (const template of newResearchTemplates) {
    const card = cards.filter({ has: page.getByRole("heading", { name: template.name, exact: true }) });
    for (const tag of template.presentation?.tags ?? []) {
      assert.equal(await card.getByText(tag, { exact: true }).count(), 1, `${template.name} should show ${tag}`);
      assert.equal(await page.getByRole("checkbox", { name: tag, exact: true }).count(), 1);
    }
  }
  await page.keyboard.press("Escape");
  await page.screenshot({ path: new URL("native-catalog-desktop.png", output).pathname, fullPage: true });
  await page.getByRole("searchbox", { name: "Search automations" }).fill("weekly reading");
  assert.equal(await cards.count(), 1);
  await page.getByRole("button", { name: "Clear filters", exact: true }).click();
  await page.getByRole("searchbox", { name: "Search automations" }).fill("reading-note");
  assert.equal(await cards.count(), 1);
  await page.getByLabel("Application", { exact: true }).selectOption("org.scholarserver.docling");
  await page.getByRole("heading", { name: "No matching automations" }).waitFor();
  await page.getByRole("button", { name: "Clear filters", exact: true }).click();
  await page.locator(".catalog-tag-picker summary").click();
  await page.getByRole("checkbox", { name: "Reading", exact: true }).check();
  assert.equal(await cards.count(), 2);
  await page.keyboard.press("Escape");
  assert.equal(await page.locator(".catalog-tag-picker").getAttribute("open"), null);
  await page.getByRole("button", { name: "Clear filters", exact: true }).click();
  await page.getByLabel("Sort by", { exact: true }).selectOption("name-desc");
  const descending = await cards.locator("h2").allTextContents();
  await page.getByLabel("Sort by", { exact: true }).selectOption("name");
  assert.deepEqual(await cards.locator("h2").allTextContents(), [...descending].reverse());
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: new URL("native-catalog-mobile.png", output).pathname, fullPage: true });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.setViewportSize({ width: 1280, height: 900 });
  const installIdentities = new Set();
  const acceptanceCases = [
    { heading: "Create reading-note starters", name: "Browser acceptance reading notes", folderLabel: "Notes folder" },
    {
      heading: "Create a weekly reading roundup",
      name: "Browser acceptance weekly roundup",
      folderLabel: "Report root folder",
      subfolder: "Weekly roundups"
    },
    {
      heading: "Check references for missing details",
      name: "Browser acceptance reference audit",
      folderLabel: "Report root folder",
      subfolder: "Reference checks"
    },
    {
      heading: "Create a Markdown bibliography",
      name: "Browser acceptance bibliography",
      folderLabel: "Report root folder",
      subfolder: "Bibliographies"
    }
  ];
  for (const [index, acceptance] of acceptanceCases.entries()) {
    const card = page.locator("section").filter({
      has: page.getByRole("heading", { name: acceptance.heading, exact: true })
    });
    await card.getByRole("button", { name: "Set up", exact: true }).click();
    await page.getByRole("heading", { name: acceptance.heading, exact: true }).waitFor();
    await page.getByLabel("Automation name", { exact: true }).fill(acceptance.name);
    await page.getByLabel("Zotero library").selectOption("personal/zotero");
    await page.getByLabel("Obsidian vault").selectOption("obsidian");
    const defaultFolder = acceptance.subfolder ? "Research" : "Research/Reading";
    assert.equal(await page.getByLabel(acceptance.folderLabel, { exact: true }).inputValue(), defaultFolder);
    await page.getByLabel(acceptance.folderLabel, { exact: true }).fill("Research/Browser");
    if (acceptance.subfolder) {
      await page
        .getByText(
          `Reports are written under the selected root in the fixed “${acceptance.subfolder}” subfolder. Existing reports are not replaced.`,
          {
            exact: true
          }
        )
        .waitFor();
      await page.screenshot({ path: new URL(`native-catalog-setup-${index}.png`, output).pathname, fullPage: true });
    }
    const installRequest = page.waitForRequest(
      (request) => new URL(request.url()).pathname.endsWith("/api/install") && request.method() === "POST"
    );
    await page.getByRole("button", { name: "Add automation", exact: true }).click();
    const requestBody = (await installRequest).postDataJSON();
    assert.match(requestBody.automationId, /^[0-9a-f-]{36}$/);
    assert.equal(
      installIdentities.has(requestBody.automationId),
      false,
      "each installation request needs a new identity"
    );
    installIdentities.add(requestBody.automationId);
    assert.equal(requestBody.name, acceptance.name);
    assert.equal(requestBody.settings.research.folder, "Research/Browser");
    const created = page.locator("section").filter({
      has: page.getByRole("heading", { name: acceptance.name, exact: true })
    });
    await created.getByRole("button", { name: "Enable schedule", exact: true }).waitFor();
    await created.getByRole("button", { name: "Enable schedule", exact: true }).click();
    await created.getByRole("button", { name: "Disable schedule", exact: true }).click();
    await page.reload();
    await created.getByRole("button", { name: "Enable schedule", exact: true }).waitFor();
    await page.getByRole("button", { name: "Catalog", exact: true }).click();
  }
  assert.equal(installIdentities.size, 4);
  await page.getByRole("button", { name: "My automations", exact: true }).click();
  await page.screenshot({ path: new URL("native-installed-desktop.png", output).pathname, fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.screenshot({ path: new URL("native-installed-mobile.png", output).pathname, fullPage: true });
  const inventory = await page.request.get("http://127.0.0.1:18231/api/automations");
  const data = await inventory.json();
  for (const acceptance of acceptanceCases) {
    const matches = Object.values(data.installations).filter((receipt) => receipt.name === acceptance.name);
    assert.equal(matches.length, 1);
    assert.equal(matches[0].bindings.folder, "Research/Browser");
    assert.equal(matches[0].editing, "guided");
    assert.equal(data.workflows.find((workflow) => workflow.id === matches[0].workflowId).active, false);
  }
  console.log(
    "Native browser passed: four real n8n workflow and credential installations with distinct identities, scoped folders, enable/disable, reload and mobile layout. Research apps are synthetic fixtures."
  );
} finally {
  await browser.close();
}
