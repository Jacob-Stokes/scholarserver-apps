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
  const origin = "http://127.0.0.1:18231";
  const catalogResponse = await page.request.get(`${origin}/api/automations`);
  assert.equal(catalogResponse.status(), 200);
  const catalogData = await catalogResponse.json();
  assert.equal(catalogData.templates.filter((template) => template.research).length, 6);
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
    const template = catalogData.templates.find((item) => item.name === acceptance.heading);
    assert.ok(template);
    await page.goto(`${origin}/automation-setup?managerSetup=1&templateId=${encodeURIComponent(template.id)}`);
    await page.getByRole("textbox", { name: "Automation name", exact: true }).fill(acceptance.name);
    await page.getByRole("combobox", { name: "Zotero library", exact: true }).selectOption("personal/zotero");
    await page.getByRole("combobox", { name: "Obsidian vault", exact: true }).selectOption("obsidian");
    const defaultFolder = acceptance.subfolder ? "Research" : "Research/Reading";
    assert.equal(
      await page.getByRole("textbox", { name: acceptance.folderLabel, exact: true }).inputValue(),
      defaultFolder
    );
    await page.getByRole("textbox", { name: acceptance.folderLabel, exact: true }).fill("Research/Browser");
    if (acceptance.subfolder) {
      await page
        .getByText(
          `Reports are written under the selected root in the fixed “${acceptance.subfolder}” subfolder. Existing reports are not replaced.`,
          {
            exact: true
          }
        )
        .waitFor();
      await page.evaluate(() => window.scrollTo(0, 0));
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
    await page.getByRole("heading", { name: "Automation added", exact: true }).waitFor();
    for (const enabled of [true, false]) {
      const response = await page.request.post(`${origin}/api/enabled`, {
        headers: { "x-requested-with": "ScholarServer" },
        data: { automationId: requestBody.automationId, enabled }
      });
      assert.equal(response.status(), 200);
    }
    await page.reload();
    await page.getByRole("textbox", { name: "Automation name", exact: true }).waitFor();
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: new URL(`native-embedded-${index}-mobile.png`, output).pathname, fullPage: true });
    await page.setViewportSize({ width: 1280, height: 900 });
  }
  assert.equal(installIdentities.size, 4);
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
    "Native embedded browser passed: four real n8n installations with distinct identities, scoped folders, reload and mobile layout. Enable/disable uses the integration API; research apps are synthetic fixtures. Manager catalog/lifecycle UI is a separate core acceptance gate."
  );
} finally {
  await browser.close();
}
