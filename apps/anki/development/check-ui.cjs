const { chromium } = require(
  process.env.SCHOLARSERVER_BROWSER_MODULES ? `${process.env.SCHOLARSERVER_BROWSER_MODULES}/playwright` : "playwright"
);
const assert = require("node:assert/strict");
const { mkdirSync } = require("node:fs");
mkdirSync(".dev/anki", { recursive: true });
(async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const page = await browser.newPage();
    await page.route("**/*", (route) =>
      route.request().url().startsWith("http://127.0.0.1:5197/") ? route.continue() : route.abort()
    );
    for (const width of [320, 390, 768, 1280]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto("http://127.0.0.1:5197/");
      await page.getByRole("button", { name: "Save setup draft" }).click();
      await page.getByRole("status").filter({ hasText: "Draft saved" }).waitFor();
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
        true,
        `overflow ${width}`
      );
    }
    await page.getByLabel("Self-hosted sync only", { exact: false }).first().check();
    await page.getByRole("button", { name: "Save setup draft" }).click();
    await page.reload();
    assert.equal(await page.getByLabel("Self-hosted sync only", { exact: false }).first().isChecked(), true);
    await page.evaluate(() => {
      Storage.prototype.setItem = function () {
        throw new Error("synthetic quota failure");
      };
    });
    await page.getByLabel("Browser desktop with AnkiWeb", { exact: false }).check();
    await page.getByRole("button", { name: "Save setup draft" }).click();
    await page.getByText("Could not save the draft.", { exact: false }).waitFor();
    assert.equal(await page.getByLabel("Browser desktop with AnkiWeb", { exact: false }).isChecked(), true);
    await page.reload();
    assert.equal(await page.getByLabel("Self-hosted sync only", { exact: false }).first().isChecked(), true);
    await page.getByLabel("Browser desktop with AnkiWeb", { exact: false }).check();
    await page.screenshot({ path: ".dev/anki/setup-preview.png", fullPage: true });
    console.log(
      "PASS: 320/390/768/1280 widths, save, reload, save failure preserves draft and stored choice; external requests blocked"
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
