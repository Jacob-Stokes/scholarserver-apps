import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { catalogAppIcons, packagedAppIcons, selectAppRoleIcon } from "../src/app-icons.ts";

const zotero = "org.scholarserver.zotero";
const original = "/api/v1/catalog/org.scholarserver.zotero/0.5.10-beta.4/icon";
const editorial = "/api/v1/catalog/org.scholarserver.zotero/0.5.10-beta.4/editorial-icon";
const catalog = catalogAppIcons([{ id: zotero, icon: { url: original }, editorialIcon: { url: editorial } }]);

test("both styles prefer package-declared catalog assets and fall back through the requested style", () => {
  assert.equal(selectAppRoleIcon(zotero, "editorial", catalog), editorial);
  assert.equal(selectAppRoleIcon(zotero, "original", catalog), original);
  assert.equal(selectAppRoleIcon(zotero, "editorial", {}), packagedAppIcons[zotero].editorial);
  assert.equal(selectAppRoleIcon(zotero, "original", {}), packagedAppIcons[zotero].original);
  assert.equal(selectAppRoleIcon(zotero, "editorial", catalog, [editorial]), packagedAppIcons[zotero].editorial);
  assert.equal(
    selectAppRoleIcon(zotero, "editorial", catalog, [editorial, packagedAppIcons[zotero].editorial]),
    original
  );
  assert.equal(selectAppRoleIcon(zotero, "original", catalog, [original]), packagedAppIcons[zotero].original);
  assert.equal(
    selectAppRoleIcon(zotero, "original", catalog, [original, packagedAppIcons[zotero].original]),
    undefined
  );
});

test("legacy and unknown apps retain original-icon or named fallbacks without a hardcoded glyph", () => {
  const old = catalogAppIcons([{ id: "custom", icon: { url: original } }]);
  assert.equal(selectAppRoleIcon("custom", "editorial", old), original);
  assert.equal(selectAppRoleIcon("custom", "original", old), original);
  assert.equal(selectAppRoleIcon("unknown", "editorial", old), undefined);
  assert.deepEqual(Object.keys(catalogAppIcons(null)), []);
  assert.deepEqual(Object.keys(catalogAppIcons([null, {}])), []);
});

test("catalog metadata cannot point icons at remote URLs, data URLs or other API routes", () => {
  for (const url of [
    "https://example.com/icon.png",
    "//example.com/icon.png",
    "data:image/svg+xml,anything",
    "/api/v1/catalog/../../../settings",
    "/api/v1/catalog/../0.1.0/icon",
    "/api/v1/catalog/%2e%2e/0.1.0/icon",
    "/api/v1/catalog/example/0.1.0/icon?redirect=1",
    "/api/v1/catalog/example\\evil/0.1.0/icon",
    "/api/v1/overview"
  ]) {
    const icons = catalogAppIcons([{ id: "custom", icon: { url }, editorialIcon: { url } }]);
    assert.equal(selectAppRoleIcon("custom", "editorial", icons), undefined, url);
    assert.equal(selectAppRoleIcon("custom", "original", icons), undefined, url);
  }
});

test("role presentation subscribes to the shared browser preference and keeps names alongside decorative icons", async () => {
  const roles = await readFile(new URL("../src/AppRoles.tsx", import.meta.url), "utf8");
  assert.match(roles, /from "@scholarserver\/ui\/icon-preference"/);
  assert.match(roles, /useSyncExternalStore\(subscribeIconStyle, readIconStyle/);
  assert.match(roles, /alt=""/);
  assert.match(roles, /<strong>\{requirement.name\}<\/strong>/);
  assert.match(roles, /onError=/);
  assert.match(roles, /const editorial =\s*style === "editorial"/);
  assert.match(roles, /icon === icons\[requirement.packageId\]\?\.editorial/);
  assert.match(roles, /icon === packagedAppIcons\[requirement.packageId\]\?\.editorial/);
  assert.match(roles, /className=\{editorial \? "ss-editorial-icon" : undefined\}/);
  assert.doesNotMatch(roles, /localStorage|fetch\(/);
  const app = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
  assert.match(app, /fetch\("\/api\/v1\/catalog", \{ signal: controller.signal \}\)/);
  // Setup still needs the installation lookup; icon discovery must not reuse that broader response.
  assert.match(app, /const overviewResponse = await fetch\("\/api\/v1\/overview"\)/);
  assert.doesNotMatch(app, /overview\.catalog/);
});
