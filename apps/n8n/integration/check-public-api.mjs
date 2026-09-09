import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { N8nClient } from "./client.mjs";
import { readTemplate, workflowFromTemplate } from "./templates.mjs";

const require = createRequire(import.meta.url);
const { chromium } = require(`${process.env.SCHOLARSERVER_BROWSER_MODULES}/playwright`);
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const context = await browser.newContext();
  const page = await context.newPage();
  // Requires a fresh disposable container forwarded to this port. Existing owner
  // accounts are not reset, and no login credentials are retained on disk.
  await page.goto("http://localhost:18230");
  await page.getByText("Set up owner account", { exact: true }).waitFor();
  await page.getByLabel("Email", { exact: false }).fill("n8n-check@example.invalid");
  await page.getByLabel("First Name", { exact: false }).fill("ScholarServer");
  await page.getByLabel("Last Name", { exact: false }).fill("Test");
  await page.getByLabel("Password", { exact: false }).fill(`Check9${randomBytes(24).toString("hex")}`);
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/setup"));
  await page.goto("http://localhost:18230/settings/api");
  await page.getByRole("button", { name: "Create API key", exact: true }).click();
  await page.getByPlaceholder("e.g Internal Project").fill("Disposable ScholarServer acceptance");
  const issuedKey = page.waitForResponse(
    (response) => response.request().method() === "POST" && new URL(response.url()).pathname === "/rest/api-keys"
  );
  await page.getByRole("button", { name: "Save", exact: true }).click();
  // Observe the legitimate UI response, not the redacted key shown in its list.
  // Production code does not call this internal account-management endpoint.
  const issued = await (await issuedKey).json();
  const apiKey = issued.data.rawApiKey;
  assert.ok(apiKey);
  const client = new N8nClient({ baseUrl: "http://localhost:18230", apiKey });
  const template = readTemplate(await readFile(new URL("../templates/connection-check.yaml", import.meta.url), "utf8"));
  const workflow = await client.createWorkflow(workflowFromTemplate(template));
  assert.equal(typeof workflow.id, "string");
  const credential = await client.createCredential({
    name: "Disposable test credential",
    type: "httpHeaderAuth",
    data: { name: "X-Test", value: "not-a-real-provider-secret" }
  });
  assert.equal(typeof credential.id, "string");
  assert.equal((await client.getWorkflow(workflow.id)).name, template.name);
  assert.ok(Array.isArray((await client.listWorkflows()).data));
  await client.setEnabled(workflow.id, true);
  assert.equal((await client.getWorkflow(workflow.id)).active, true);
  await client.setEnabled(workflow.id, false);
  assert.equal((await client.getWorkflow(workflow.id)).active, false);
  assert.ok(Array.isArray((await client.listExecutions(workflow.id)).data));
  if (process.env.SCHOLARSERVER_CHECK_INTEGRATION === "1") {
    await page.goto("http://localhost:18231");
    await page.getByLabel("n8n API key", { exact: true }).fill(apiKey);
    await page.getByRole("button", { name: "Save connection", exact: true }).click();
    await page.getByLabel("Run every (hours)").fill("6");
    await page.getByRole("button", { name: "Add automation", exact: true }).click();
    await page.getByRole("button", { name: "Enable schedule", exact: true }).click();
    await page.getByRole("button", { name: "Disable schedule", exact: true }).waitFor();
    await page.getByRole("button", { name: "Disable schedule", exact: true }).click();
    await page.getByRole("button", { name: "Enable schedule", exact: true }).waitFor();
    await page.reload();
    await page.getByRole("button", { name: "Enable schedule", exact: true }).waitFor();
    assert.equal(await page.getByRole("button", { name: "Add automation", exact: true }).count(), 0);
    await page.getByRole("button", { name: "Show recent runs", exact: true }).click();
    await page.getByText("No recorded runs.", { exact: true }).waitFor();
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    const missingHeader = await fetch("http://localhost:18231/api/connect", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}"
    });
    assert.equal(missingHeader.status, 403);
    const status = await (await fetch("http://localhost:18231/api/status")).json();
    assert.deepEqual(status, { connected: true });
    const inventory = await (await fetch("http://localhost:18231/api/automations")).json();
    const configured = await client.getWorkflow(inventory.installations[template.id].workflowId);
    assert.equal(
      configured.nodes.find((node) => node.id === "hourly-trigger").parameters.rule.interval[0].hoursInterval,
      6
    );
    console.log("App UI: connection, install, enable/disable, reload, runs, mobile width and request boundary passed.");
  }
  await client.request(`credentials/${encodeURIComponent(credential.id)}`, { method: "DELETE" });
  await client.request(`workflows/${encodeURIComponent(workflow.id)}`, { method: "DELETE" });
  console.log(
    "Public API: workflow create/read/list/enable/disable, credential create/delete, execution list and workflow cleanup passed."
  );
} finally {
  await browser.close();
}
