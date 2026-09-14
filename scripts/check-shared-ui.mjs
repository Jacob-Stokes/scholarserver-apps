import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

if (process.argv.length !== 4 || process.argv[2] !== "--core-ui") {
  throw new Error("Usage: node scripts/check-shared-ui.mjs --core-ui /path/to/academic-system/packages/ui");
}
const canonical = path.resolve(process.argv[3]);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const vendor = path.join(root, "vendor/scholarserver-ui");
let checked = 0;
async function compareFiles(relative = "") {
  const entries = await readdir(path.join(canonical, relative), { withFileTypes: true });
  for (const entry of entries) {
    if (!relative && ["node_modules", "test", "tsconfig.json", "README.md", "package.json"].includes(entry.name))
      continue;
    const filename = path.join(relative, entry.name);
    if (entry.isDirectory()) {
      await compareFiles(filename);
    } else {
      assert.ok(entry.isFile(), `${filename}: canonical runtime must be a regular file`);
      const source = await readFile(path.join(canonical, filename));
      const snapshot = await readFile(path.join(vendor, filename));
      assert.ok(source.equals(snapshot), `${filename}: vendor differs from canonical bytes`);
      checked++;
    }
  }
}
await compareFiles();
const sourcePackage = JSON.parse(await readFile(path.join(canonical, "package.json"), "utf8"));
const vendorPackage = JSON.parse(await readFile(path.join(vendor, "package.json"), "utf8"));
for (const field of ["name", "version", "type"]) assert.equal(vendorPackage[field], sourcePackage[field], field);
// The snapshot retains app-only exports/peers and provenance metadata. Do not discard them when merging core.
for (const field of ["exports", "dependencies", "peerDependencies"]) {
  for (const [key, value] of Object.entries(sourcePackage[field] ?? {})) {
    assert.deepEqual(vendorPackage[field]?.[key], value, `${field}.${key}`);
  }
}
console.log(`${checked} canonical runtime/font files match byte-for-byte; package exports and dependencies agree.`);
