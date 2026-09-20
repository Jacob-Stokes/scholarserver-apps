// Compiled UI, loopback assets and synthetic responses. No installed app is used.
import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const modules = process.env.SCHOLARSERVER_BROWSER_MODULES;
const { chromium } = require(modules ? `${modules}/playwright` : "playwright");
const output = new URL("../../../../.dev/freshrss-loading/", import.meta.url);
await mkdir(output, { recursive: true });
const server = createServer(async (req, res) => {
  const path = new URL(req.url, "http://localhost").pathname;
  const asset = path.match(/^\/apps\/freshrss\/assets\/([\w.-]+)$/)?.[1];
  if (!asset && !["/apps/freshrss/configuration", "/apps/freshrss/overview"].includes(path)) {
    res.writeHead(404).end();
    return;
  }
  try {
    const content = await readFile(new URL(asset ? `../dist/assets/${asset}` : "../dist/index.html", import.meta.url));
    let type = "text/html";
    if (asset?.endsWith(".js")) type = "text/javascript";
    if (asset?.endsWith(".css")) type = "text/css";
    if (asset?.endsWith(".woff2")) type = "font/woff2";
    if (asset?.endsWith(".woff")) type = "font/woff";
    res.writeHead(200, { "content-type": type }).end(content);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({
  headless: true,
  channel: process.env.SCHOLARSERVER_BROWSER_CHANNEL || "chrome"
});
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: "reduce" });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  let releaseStatus, releaseAppearance, releaseAddress;
  let holdStatus = true,
    holdAppearance = true,
    holdAddress = true;
  let failStatus = false,
    expired = false,
    failAppearance = false,
    failSave = false;
  const ready = { phase: "ready", ready: true, signIn: "scholarserver", username: "synthetic" };
  let currentStatus = ready;
  let linkResponseStatus = 200;
  let linkCalls = 0;
  let loseLinkResponse = false;
  let appearanceReads = 0;
  let addressReads = 0;
  let savedStyle = "original";
  let savedAddress = "tailscale";
  let addressExpired = false;
  let appearanceExpired = false;
  let holdAppearanceSave = false;
  let releaseAppearanceSave;
  function addressResponse() {
    return {
      options: ["tailscale", "cloudflare"].map((id) => ({
        id,
        transport: id,
        label: id,
        url: `${origin}/reader`,
        recommended: false,
        advanced: false,
        authentication: { authentik: "required", available: true, defaultEnabled: true }
      })),
      selection: { optionId: savedAddress, url: `${origin}/reader` }
    };
  }
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) return route.abort();
    if (!url.pathname.includes("/api/")) return route.continue();
    if (url.pathname.endsWith("/api/status")) {
      if (holdStatus)
        await new Promise((resolve) => {
          releaseStatus = resolve;
        });
      if (expired) return route.fulfill({ status: 401, json: {} });
      return route.fulfill({ status: failStatus ? 503 : 200, json: failStatus ? {} : currentStatus });
    }
    if (url.pathname === "/api/v1/overview") return route.fulfill({ json: { workspace: { id: "personal" } } });
    if (url.pathname === "/api/v1/instances/personal/freshrss/actions/link-sign-in") {
      assert.equal(route.request().method(), "POST");
      linkCalls++;
      if (linkResponseStatus === 200) currentStatus = ready;
      if (loseLinkResponse) return route.abort();
      return route.fulfill({ status: linkResponseStatus, json: currentStatus });
    }
    if (url.pathname.endsWith("/api/appearance")) {
      if (route.request().method() === "PUT") {
        const acceptedStyle = route.request().postDataJSON().style;
        if (!failSave) savedStyle = acceptedStyle;
        if (holdAppearanceSave)
          await new Promise((resolve) => {
            releaseAppearanceSave = resolve;
          });
        return route.fulfill({ status: failSave ? 503 : 200, json: { style: acceptedStyle } });
      }
      appearanceReads++;
      if (holdAppearance)
        await new Promise((resolve) => {
          releaseAppearance = resolve;
        });
      if (appearanceExpired) return route.fulfill({ status: 403, json: {} });
      return route.fulfill({ status: failAppearance ? 503 : 200, json: { style: savedStyle } });
    }
    if (url.pathname.endsWith("/access-options")) {
      if (route.request().method() === "PUT") {
        if (!failSave) savedAddress = route.request().postDataJSON().optionId;
        return route.fulfill({ status: failSave ? 503 : 200, json: addressResponse() });
      }
      addressReads++;
      if (holdAddress)
        await new Promise((resolve) => {
          releaseAddress = resolve;
        });
      if (addressExpired) return route.fulfill({ status: 401, json: {} });
      return route.fulfill({ json: addressResponse() });
    }
    return route.fulfill({ status: 404, json: {} });
  });
  await page.goto(`${origin}/apps/freshrss/configuration`);
  await page.getByRole("status").filter({ hasText: "Loading FreshRSS status" }).waitFor();
  assert.equal(await page.getByRole("heading", { name: "FreshRSS", exact: true }).count(), 1);
  assert.equal(await page.getByText("Setup needed", { exact: true }).count(), 0);
  assert.equal(await page.getByRole("button", { name: "Use ScholarServer sign-in", exact: true }).count(), 0);
  holdStatus = false;
  releaseStatus();
  await page.getByRole("heading", { name: "Your reading list", exact: true }).waitFor();
  await page.getByRole("status").filter({ hasText: "Loading reader appearance" }).waitFor();
  const appearance = page.getByRole("combobox", { name: "Appearance", exact: true });
  assert.equal(await appearance.isDisabled(), true);
  assert.equal(await appearance.inputValue(), "");
  const save = page.getByRole("button", { name: "Save appearance", exact: true });
  assert.equal(await save.isDisabled(), true);
  assert.equal(await page.getByText("Choose where you will open FreshRSS.", { exact: true }).count(), 0);
  holdAddress = false;
  releaseAddress();
  await page.getByRole("link", { name: "Open FreshRSS", exact: true }).waitFor();
  assert.equal(await save.isDisabled(), true, "Reader opens while appearance is still loading");
  await page.getByText("Change reader address", { exact: true }).click();
  const alternativeAddress = page.getByRole("radio", { name: /cloudflare/ });
  await alternativeAddress.check();
  failSave = true;
  await page.getByRole("button", { name: "Save reader address", exact: true }).click();
  await page.getByText("Could not confirm the reader address.", { exact: false }).waitFor();
  assert.equal(await alternativeAddress.isChecked(), true, "Failed address save preserves the choice");
  assert.equal(await alternativeAddress.isEnabled(), true);
  failSave = false;
  await page.getByRole("button", { name: "Save reader address", exact: true }).click();
  await page.getByText("Change reader address", { exact: true }).click();
  holdAppearance = false;
  releaseAppearance();
  await page.waitForFunction(() => !document.querySelector("select").disabled);
  assert.equal(await appearance.inputValue(), "original");
  await appearance.selectOption("scholarserver");
  failSave = true;
  await save.click();
  await page.getByText("Could not confirm the save.", { exact: false }).waitFor();
  assert.equal(await appearance.inputValue(), "scholarserver", "Failed save retains the draft");
  failSave = false;
  await save.click();
  await page.getByText("Saved. Reload your reader to see the change.", { exact: true }).waitFor();

  // A fresh tab return reuses saved data and keeps the unsaved form choice.
  await appearance.selectOption("original");
  const appearanceBeforeReturn = appearanceReads;
  const addressBeforeReturn = addressReads;
  await page.getByRole("button", { name: "Overview", exact: true }).click();
  await page.getByRole("button", { name: "Configuration", exact: true }).click();
  assert.equal(await appearance.inputValue(), "original");
  assert.equal(await save.isEnabled(), true);
  assert.equal(appearanceReads, appearanceBeforeReturn, "Fresh return does not refetch appearance");
  assert.equal(addressReads, addressBeforeReturn, "Fresh return does not refetch addresses");

  await page.getByText("Change reader address", { exact: true }).click();
  await page.getByRole("radio", { name: /tailscale/ }).check();

  const reading = page.getByRole("heading", { name: "Your reading list", exact: true });
  await reading.scrollIntoViewIfNeeded();
  const before = await reading.boundingBox();
  holdStatus = true;
  await page.clock.install();
  await page.clock.setSystemTime(new Date(Date.now() + 31_000));
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await page.getByRole("status").filter({ hasText: "Refreshing FreshRSS status" }).waitFor();
  await page.waitForFunction(() => !document.querySelector("select").disabled);
  assert.ok(appearanceReads > appearanceBeforeReturn, "Stale visible appearance actually refreshed");
  assert.ok(addressReads > addressBeforeReturn, "Stale visible addresses actually refreshed");
  assert.equal(await appearance.inputValue(), "original", "Background read cannot overwrite an appearance draft");
  assert.equal(
    await page.getByRole("radio", { name: /tailscale/ }).isChecked(),
    true,
    "Background read cannot overwrite an address draft"
  );
  const during = await reading.boundingBox();
  assert.ok(Math.abs(before.y - during.y) < 1, "Background status does not move the reading list");
  failStatus = true;
  holdStatus = false;
  releaseStatus();
  await page.getByText("Could not check FreshRSS.", { exact: false }).waitFor();
  assert.equal(await reading.isVisible(), true, "Transient failure keeps known content");
  failStatus = false;
  expired = true;
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await page.getByText("Sign in to ScholarServer again, then retry.", { exact: false }).waitFor();
  assert.equal(await reading.count(), 0, "Lost sign-in removes private status and child panels");
  expired = false;
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await reading.waitFor();

  // A denial in either child removes the entire session, not just one panel.
  for (const denied of ["address", "appearance"]) {
    await page.waitForFunction(() => document.querySelector("select") && !document.querySelector("select").disabled);
    await page.getByRole("link", { name: "Open FreshRSS", exact: true }).waitFor();
    if (denied === "address") addressExpired = true;
    else appearanceExpired = true;
    await page.clock.setSystemTime(new Date((await page.evaluate(() => Date.now())) + 31_000));
    await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    await page.getByText("Sign in to ScholarServer again, then retry.", { exact: false }).waitFor();
    assert.equal(await reading.count(), 0);
    assert.equal(await appearance.count(), 0);
    addressExpired = false;
    appearanceExpired = false;
    await page.getByRole("button", { name: "Try again", exact: true }).click();
    await page.waitForFunction(() => document.querySelector("select") && !document.querySelector("select").disabled);
    await reading.waitFor();
  }

  // The server accepted a save, but its response arrives after access recovery.
  // It must not clear the new session's draft or show a misleading success message.
  holdAppearanceSave = true;
  await appearance.selectOption("original");
  await save.click();
  await page.getByRole("button", { name: "Saving…", exact: true }).waitFor();
  addressExpired = true;
  await page.clock.setSystemTime(new Date((await page.evaluate(() => Date.now())) + 31_000));
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await page.getByText("Sign in to ScholarServer again, then retry.", { exact: false }).waitFor();
  addressExpired = false;
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await page.waitForFunction(() => document.querySelector("select") && !document.querySelector("select").disabled);
  await appearance.selectOption("scholarserver");
  holdAppearanceSave = false;
  const lateResponse = page.waitForResponse(
    (response) => response.url().endsWith("/api/appearance") && response.request().method() === "PUT"
  );
  releaseAppearanceSave();
  await lateResponse;
  assert.equal(await appearance.inputValue(), "scholarserver");
  assert.equal(await page.getByText("Saved. Reload your reader to see the change.", { exact: true }).count(), 0);

  failAppearance = true;
  await page.reload();
  await page.getByText("Could not load the reader appearance.", { exact: false }).waitFor();
  assert.equal(await save.isDisabled(), true);
  failAppearance = false;
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await page.waitForFunction(() => !document.querySelector("select").disabled);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.screenshot({ path: new URL("configuration-mobile.png", output).pathname, fullPage: true });
  await page.getByRole("button", { name: "Overview", exact: true }).click();
  await reading.waitFor();
  await page.screenshot({ path: new URL("overview-mobile.png", output).pathname, fullPage: true });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.evaluate(() => localStorage.setItem("scholarserver.animations-off.v1", "true"));
  holdStatus = true;
  await page.reload();
  await page.getByRole("status").filter({ hasText: "Loading FreshRSS status" }).waitFor();
  assert.equal(await page.locator("html").getAttribute("data-motion"), "off");
  holdStatus = false;
  releaseStatus();
  await reading.waitFor();
  currentStatus = { ...ready, signIn: "password" };
  linkResponseStatus = 401;
  await page.reload();
  const link = page.getByRole("button", { name: "Use ScholarServer sign-in", exact: true });
  await link.click();
  await page.getByText("Sign in to ScholarServer again, then retry.", { exact: false }).waitFor();
  assert.equal(await link.count(), 0, "Mutation access denial clears the status and setup controls");
  await page.clock.runFor(60_000);
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  assert.equal(await link.count(), 0, "Completing the denied mutation cannot force-read through the block");
  assert.equal(linkCalls, 1);
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await link.waitFor();
  linkResponseStatus = 200;
  loseLinkResponse = true;
  await link.click();
  await reading.waitFor();
  assert.equal(linkCalls, 2, "A lost write response is reconciled by status, not by replaying the link");
  await page.reload();
  await reading.waitFor();
  assert.equal(linkCalls, 2, "Reload observes the accepted state without repeating the operation");
  assert.deepEqual(errors, []);
  console.log(
    "PASS: independent loading, no false setup/defaults, retained refresh, stable layout, failure/retry, draft preservation, auth expiry, mobile width, denied link and lost-response reconciliation without replay"
  );
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}
