// Production UI with a synthetic Manager API. This does not prove live routing.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require(`${process.env.SCHOLARSERVER_BROWSER_MODULES}/playwright`);
const server = createServer(async (request, response) => {
  const pathname = new URL(request.url, "http://localhost").pathname;
  const asset = pathname.match(/\/assets\/([\w.-]+)$/)?.[1];
  try {
    const file = new URL(`../ui/dist/${asset ? `assets/${asset}` : "index.html"}`, import.meta.url);
    let type = "text/html";
    if (asset?.endsWith(".js")) type = "text/javascript";
    if (asset?.endsWith(".css")) type = "text/css";
    response.writeHead(200, { "content-type": type }).end(await readFile(file));
  } catch {
    response.writeHead(404).end();
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
let browser;
try {
  browser = await chromium.launch({ headless: true, channel: process.env.SCHOLARSERVER_BROWSER_CHANNEL });
  const page = await browser.newPage();
  const options = [
    {
      id: "private",
      transport: "tailscale",
      label: "Private Tailscale",
      url: "https://example.ts.net/",
      recommended: true,
      advanced: false,
      authentication: { authentik: "optional", available: true, defaultEnabled: false }
    },
    {
      id: "public",
      transport: "cloudflare",
      label: "Cloudflare",
      url: "https://paperless.example.com/",
      recommended: false,
      advanced: false,
      authentication: { authentik: "required", available: true, defaultEnabled: true }
    }
  ];
  let writes = 0;
  let fail = true;
  await page.route("**/api/v1/instances/paperless/endpoints/documents/access-options", async (route) => {
    if (route.request().method() === "PUT") {
      writes++;
      assert.deepEqual(route.request().postDataJSON(), { optionId: "public", authentication: "authentik" });
      if (fail) return route.fulfill({ status: 503, json: {} });
      return route.fulfill({
        json: { options, selection: { optionId: "public", authentication: "authentik", url: options[1].url } }
      });
    }
    return route.fulfill({ json: { options, selection: null } });
  });
  await page.goto(`http://127.0.0.1:${server.address().port}/apps/paperless/`);
  await page.getByRole("button", { name: "Setup", exact: true }).click();
  await page.getByRole("radio", { name: /Private Tailscale/ }).waitFor();
  assert.equal(await page.getByRole("radio", { name: /Private Tailscale/ }).isChecked(), true);
  await page.getByRole("radio", { name: /Cloudflare/ }).check();
  assert.equal(await page.getByRole("checkbox").isChecked(), true);
  assert.equal(await page.getByRole("checkbox").isDisabled(), true);
  await page.getByRole("button", { name: "Save address", exact: true }).click();
  await page.getByRole("alert").waitFor();
  assert.equal(writes, 1);
  assert.equal(await page.getByRole("radio", { name: /Cloudflare/ }).isChecked(), true);
  assert.equal(await page.getByRole("link", { name: "Open Paperless" }).count(), 0);
  fail = false;
  await page.getByRole("button", { name: "Save address", exact: true }).click();
  await page.getByRole("link", { name: "Open Paperless" }).waitFor();
  assert.equal(await page.getByRole("link", { name: "Open Paperless" }).getAttribute("href"), options[1].url);
  assert.equal(writes, 2);
  console.log(
    "PASS mocked browser: private default, required sign-in, failed-save draft preserved, explicit retry and Open link"
  );
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
