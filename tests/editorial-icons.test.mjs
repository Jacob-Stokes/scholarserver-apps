import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { lstat, readdir, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const lock = JSON.parse(await readFile(path.join(root, "editorial-icons.lock.json"), "utf8"));
const originalLock = JSON.parse(await readFile(path.join(root, "icons.lock.json"), "utf8"));

test("every packaged app declares its own editorial raster without replacing the original", async () => {
  const apps = [];
  for (const entry of await readdir(path.join(root, "apps"), { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    try {
      await lstat(path.join(root, "apps", entry.name, "package"));
      apps.push(entry.name);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  assert.deepEqual(Object.keys(lock.icons).sort(), apps.sort());
  assert.equal(lock.schemaVersion, 1);
  assert.equal(lock.size, 256);
  assert.equal(lock.attribution.name, "ScholarServer editorial marks");
  assert.equal(lock.attribution.license, "CC-BY-4.0");
  for (const [app, icon] of Object.entries(lock.icons)) {
    const packageRoot = path.join(root, "apps", app, "package");
    const manifest = parse(await readFile(path.join(packageRoot, "scholarserver-app.yaml"), "utf8"));
    assert.deepEqual(
      manifest.presentation.editorialIcon,
      {
        path: `assets/icons/${app}-editorial.png`,
        mediaType: "image/png",
        attribution: lock.attribution
      },
      app
    );
    assert.equal(icon.path, `apps/${app}/package/assets/icons/${app}-editorial.png`);
    assert.notEqual(manifest.presentation.icon.path, manifest.presentation.editorialIcon.path);
    const original = await readFile(path.join(packageRoot, manifest.presentation.icon.path));
    assert.equal(createHash("sha256").update(original).digest("hex"), originalLock.icons[app].sha256, app);
  }
});

test("editorial assets are bounded packaged PNGs with locked editable font-independent SVGs", async () => {
  for (const [app, icon] of Object.entries(lock.icons)) {
    assert.equal(icon.source, `apps/${app}/artwork/editorial.svg`);
    for (const [field, digestField] of [
      ["source", "sourceSha256"],
      ["path", "sha256"]
    ]) {
      const filename = path.join(root, icon[field]);
      const information = await lstat(filename);
      assert.ok(information.isFile() && !information.isSymbolicLink(), `${app}: ${field}`);
      assert.ok((await realpath(filename)).startsWith(`${await realpath(root)}${path.sep}`));
      assert.ok(information.size > 0 && information.size <= 512 * 1024);
      const bytes = await readFile(filename);
      assert.equal(createHash("sha256").update(bytes).digest("hex"), icon[digestField], `${app}: ${field} hash`);
    }
    const svg = await readFile(path.join(root, icon.source), "utf8");
    assert.match(svg, /viewBox="0 0 128 128"/);
    assert.match(svg, /<title>.+<\/title>/);
    assert.match(svg, /<desc>ScholarServer:/);
    assert.doesNotMatch(svg, /<(?:script|text|image|use|style|foreignObject)\b|\bon\w+=|\bhref=|url\(|<!DOCTYPE/i);
    const png = await readFile(path.join(root, icon.path));
    assert.deepEqual(png.subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), app);
    assert.equal(png.toString("ascii", 12, 16), "IHDR");
    assert.equal(png.readUInt32BE(16), lock.size);
    assert.equal(png.readUInt32BE(20), lock.size);
    assert.equal(png[24], 8, "8-bit channels");
    assert.equal(png[25], 6, "RGBA transparency");
  }
});

test("n8n fingerprints every bundled editorial raster and preserves the packaged attribution notice", async () => {
  const inventory = JSON.parse(await readFile(path.join(root, "scripts/image-source-inventory.json"), "utf8"));
  const recipe = inventory.recipes.find((entry) => entry.name === "n8n-app");
  const dockerfile = await readFile(path.join(root, recipe.dockerfile), "utf8");
  for (const app of ["zotero", "obsidian", "docling"]) {
    assert.ok(recipe.sourceInputs.includes(lock.icons[app].path));
    assert.ok(dockerfile.includes(`COPY apps/${app}/package/assets/icons `));
  }
  const notice = await readFile(path.join(root, "apps/n8n/ui/public/assets/ICON-NOTICES.txt"), "utf8");
  assert.match(notice, /selfh.st\/icons, CC BY 4.0/);
  assert.match(notice, /Editorial Zotero, Obsidian and Docling marks: ScholarServer, CC BY 4.0/);
});

test("editorial prerelease identities retain explicit package publication blocks", async () => {
  for (const app of Object.keys(lock.icons)) {
    const manifest = parse(await readFile(path.join(root, "apps", app, "package/scholarserver-app.yaml"), "utf8"));
    if (!manifest.packageVersion.includes(".editorial.")) continue;
    const block = await readFile(path.join(root, "apps", app, "RELEASE_BLOCKED.md"), "utf8");
    assert.ok(block.includes(manifest.packageVersion), `${app}: gate identifies the exact candidate`);
    assert.match(block, /not published or qualified for a live/);
  }
  const release = await readFile(path.join(root, "scripts/build-release.sh"), "utf8");
  assert.match(release, /RELEASE_BLOCKED\.md/);
});
