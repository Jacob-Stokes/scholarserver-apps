// Live disposable reader only; never pass a user's account or production URL.
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const modules = process.env.SCHOLARSERVER_BROWSER_MODULES;
const { chromium } = require(modules ? `${modules}/playwright` : "playwright");
const setupOrigin = "http://127.0.0.1:18213";
const readerOrigin = "http://127.0.0.1:18214";
const output = new URL("../../../../.dev/freshrss-appearance/", import.meta.url).pathname;
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: process.env.SCHOLARSERVER_BROWSER_CHANNEL });
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 850 } });
  const page = await context.newPage();
  await page.goto(`${readerOrigin}/i/`);
  await page.locator('input[name="username"]').fill("reader");
  await page.locator("#passwordPlain").fill("Synthetic-Theme-Only-2026");
  await page.locator("#loginButton").click();
  await page.waitForLoadState("networkidle");
  await page.locator(".ss-reader-brand").waitFor();
  await page.reload(); // Remove the transient sign-in message before visual comparisons.
  await page.evaluate(() => document.fonts.ready);
  assert.ok(await page.evaluate(() => document.fonts.check('16px "Source Sans 3"')));
  const initial = await page.locator("body").evaluate((element) => getComputedStyle(element).backgroundColor);
  await page.screenshot({ path: `${output}original-palette.png`, fullPage: true });
  const peer = await context.newPage();
  await peer.goto(`${readerOrigin}/i/`);
  await peer.evaluate(() =>
    localStorage.setItem("scholarserver.appearance.v1", JSON.stringify({ theme: "euler", mode: "light" }))
  );
  await page.waitForFunction(() => document.documentElement.dataset.colourTheme === "euler");
  assert.notEqual(await page.locator("body").evaluate((element) => getComputedStyle(element).backgroundColor), initial);
  await page.screenshot({ path: `${output}euler.png`, fullPage: true });
  await peer.evaluate(() =>
    localStorage.setItem("scholarserver.appearance.v1", JSON.stringify({ theme: "euler", mode: "dark" }))
  );
  await page.waitForFunction(() => document.documentElement.dataset.mode === "dark");
  const titleColours = await page
    .locator(".flux_header .item .title")
    .first()
    .evaluate((element) => {
      const header = element.closest(".flux_header");
      return [getComputedStyle(element).color, getComputedStyle(header).backgroundColor];
    });
  function luminance(colour) {
    const channels = colour
      .match(/[\d.]+/g)
      .slice(0, 3)
      .map(Number)
      .map((value) => {
        const normalized = value / 255;
        return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
      });
    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  }
  const brightness = titleColours.map(luminance).sort((a, b) => b - a);
  assert.ok((brightness[0] + 0.05) / (brightness[1] + 0.05) >= 4.5, "article title contrast in dark mode");
  await page.screenshot({ path: `${output}dark.png`, fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: `${output}mobile.png`, fullPage: true });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));

  for (const [choice, family] of [
    ["nebula", "Nebula Sans"],
    ["computer-modern", "Computer Modern Sans"],
    ["source", "Source Sans 3"]
  ]) {
    await peer.evaluate((font) => localStorage.setItem("scholarserver.font.v1", font), choice);
    await page.waitForFunction((font) => document.documentElement.dataset.font === font, choice);
    const loaded = await page.evaluate(async (name) => (await document.fonts.load(`16px "${name}"`)).length, family);
    assert.ok(loaded > 0, `${family} font bytes load from the reader`);
  }

  const config = await context.newPage();
  await config.goto(`${setupOrigin}/configuration`);
  const choice = config.getByRole("combobox", { name: "Appearance", exact: true });
  await choice.selectOption("original");
  await config.route("**/api/appearance", async (route) => {
    if (route.request().method() === "PUT") return route.fulfill({ status: 503, body: "{}" });
    return route.continue();
  });
  await config.getByRole("button", { name: "Save appearance", exact: true }).click();
  await config.getByRole("alert").filter({ hasText: "Could not save" }).waitFor();
  assert.equal(await choice.inputValue(), "original", "failed save preserves the draft");
  await config.unroute("**/api/appearance");
  await config.getByRole("button", { name: "Save appearance", exact: true }).click();
  await config.getByRole("status").filter({ hasText: "Saved." }).waitFor();
  await page.setViewportSize({ width: 1280, height: 850 });
  await page.reload();
  assert.equal(await page.locator(".ss-reader-brand").count(), 0);
  assert.equal(await page.locator('link[href*="/themes/ScholarServer/"]').count(), 0);
  await page.screenshot({ path: `${output}freshrss-original.png`, fullPage: true });
  await choice.selectOption("scholarserver");
  await config.getByRole("button", { name: "Save appearance", exact: true }).click();
  await config.getByRole("status").filter({ hasText: "Saved." }).waitFor();
  await page.reload();
  await page.locator(".ss-reader-brand").waitFor();
  console.log(
    "PASS: native login, fonts, live palette and dark mode, mobile width, original mode, failed-save draft and retry"
  );
  console.log(`Screenshots: ${output}`);
} finally {
  await browser.close();
}
