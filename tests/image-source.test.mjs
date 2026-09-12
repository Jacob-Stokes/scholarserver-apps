import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  discoverDockerfiles,
  fingerprintRecipe,
  loadInventory,
  readManifestImage,
  validateSourceLock
} from "../scripts/check-image-source.mjs";

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "scholarserver-image-source-"));
  const manifestReference = "ghcr.io/jacob-stokes/scholarserver-fixture@sha256:" + "b".repeat(64);
  await writeFile(path.join(root, "Dockerfile"), "FROM node:24-alpine@sha256:" + "a".repeat(64) + "\n");
  await writeFile(path.join(root, "ui.ts"), "export const ui = 'old';\n");
  await writeFile(path.join(root, "vendor.ts"), "export const vendor = 'old';\n");
  await writeFile(path.join(root, "compose.yaml"), `services:\n  fixture-image:\n    image: ${manifestReference}\n`);
  await writeFile(
    path.join(root, "scholarserver-app.yaml"),
    `images:\n  - service: fixture-image\n    reference: ${manifestReference}\n`
  );
  const recipe = {
    name: "fixture-image",
    dockerfile: "Dockerfile",
    context: ".",
    repository: "scholarserver-fixture",
    manifest: "compose.yaml",
    service: "fixture-image",
    nativeArchitectures: ["amd64", "arm64"],
    licenseCheck: "Dockerfile",
    sourceInputs: ["Dockerfile", "ui.ts", "vendor.ts"]
  };
  return { root, recipe };
}

function lockFor(recipe, sourceDigest, nativeArchitectures = recipe.nativeArchitectures) {
  return {
    format: 1,
    records: [
      {
        recipe: recipe.name,
        reference: "ghcr.io/jacob-stokes/scholarserver-fixture@sha256:" + "b".repeat(64),
        sourceDigest,
        nativeArchitectures
      }
    ]
  };
}

async function withFixture(callback) {
  const value = await fixture();
  try {
    return await callback(value);
  } finally {
    await rm(value.root, { recursive: true, force: true });
  }
}

async function currentFingerprint(root, recipe) {
  const fingerprint = await fingerprintRecipe(root, recipe);
  fingerprint.manifestReference = "ghcr.io/jacob-stokes/scholarserver-fixture@sha256:" + "b".repeat(64);
  return fingerprint;
}

test("vendor and UI source changes produce a stale source-lock result", async () => {
  await withFixture(async ({ root, recipe }) => {
    const original = await currentFingerprint(root, recipe);
    const lock = lockFor(recipe, original.digest);
    await writeFile(path.join(root, "vendor.ts"), "export const vendor = 'changed';\n");
    const current = await currentFingerprint(root, recipe);
    const fingerprints = new Map([[recipe.name, current]]);
    assert.throws(
      () => validateSourceLock(lock, { recipes: [recipe] }, fingerprints),
      /stale source-lock record for recipe fixture-image/
    );
  });
});

test("missing source-lock records name the recipe", async () => {
  await withFixture(async ({ root, recipe }) => {
    const current = await currentFingerprint(root, recipe);
    assert.throws(
      () => validateSourceLock({ format: 1, records: [] }, { recipes: [recipe] }, new Map([[recipe.name, current]])),
      /missing source-lock record for recipe fixture-image/
    );
  });
});

test("mismatched source digest is reported as stale", async () => {
  await withFixture(async ({ root, recipe }) => {
    const current = await currentFingerprint(root, recipe);
    const lock = lockFor(recipe, "sha256:" + "0".repeat(64));
    assert.throws(
      () => validateSourceLock(lock, { recipes: [recipe] }, new Map([[recipe.name, current]])),
      /stale source-lock record for recipe fixture-image/
    );
  });
});

test("source-lock reference must equal the selected package manifest image", async () => {
  await withFixture(async ({ root, recipe }) => {
    const current = await currentFingerprint(root, recipe);
    const lock = lockFor(recipe, current.digest);
    lock.records[0].reference = "ghcr.io/jacob-stokes/other@sha256:" + "c".repeat(64);
    assert.throws(
      () => validateSourceLock(lock, { recipes: [recipe] }, new Map([[recipe.name, current]])),
      /source-lock reference mismatch for recipe fixture-image/
    );
  });
});

test("one lock accepts independent immutable references for independent recipes", async () => {
  await withFixture(async ({ root, recipe }) => {
    const current = await currentFingerprint(root, recipe);
    const secondRecipe = { ...recipe, name: "second-image" };
    const second = { ...current, manifestReference: "ghcr.io/jacob-stokes/second-image@sha256:" + "c".repeat(64) };
    const lock = lockFor(recipe, current.digest);
    lock.records.push({
      recipe: secondRecipe.name,
      reference: second.manifestReference,
      sourceDigest: second.digest,
      nativeArchitectures: secondRecipe.nativeArchitectures
    });
    assert.doesNotThrow(() =>
      validateSourceLock(
        lock,
        { recipes: [recipe, secondRecipe] },
        new Map([
          [recipe.name, current],
          [secondRecipe.name, second]
        ])
      )
    );
  });
});

test("source inputs cannot escape the exported source root", async () => {
  await withFixture(async ({ root, recipe }) => {
    await assert.rejects(
      () => fingerprintRecipe(root, { ...recipe, sourceInputs: ["../outside"] }),
      /Source input escapes exported source root/
    );
  });
});

test("missing native architecture is reported as incomplete", async () => {
  await withFixture(async ({ root, recipe }) => {
    const current = await currentFingerprint(root, recipe);
    const lock = lockFor(recipe, current.digest, ["amd64"]);
    assert.throws(
      () => validateSourceLock(lock, { recipes: [recipe] }, new Map([[recipe.name, current]])),
      /incomplete source-lock record for recipe fixture-image: missing native architecture\(s\) arm64/
    );
  });
});

test("image selection requires matching parsed package and Compose declarations", async () => {
  await withFixture(async ({ root, recipe }) => {
    assert.match(await readManifestImage(root, recipe), /@sha256:b{64}$/);
    await writeFile(path.join(root, "scholarserver-app.yaml"), "images: []\n");
    await assert.rejects(() => readManifestImage(root, recipe), /references disagree/);
    await writeFile(path.join(root, "compose.yaml"), "services: {}\nservices: {}\n");
    await assert.rejects(() => readManifestImage(root, recipe), /Invalid YAML/);
  });
});

test("source fingerprints include executable bits and reject symlink ancestors", async () => {
  await withFixture(async ({ root, recipe }) => {
    const before = await fingerprintRecipe(root, recipe);
    await chmod(path.join(root, "ui.ts"), 0o755);
    assert.notEqual((await fingerprintRecipe(root, recipe)).digest, before.digest);
    await symlink(root, path.join(root, "alias"));
    await assert.rejects(
      () => fingerprintRecipe(root, { ...recipe, sourceInputs: ["alias/ui.ts"] }),
      /Symlink source inputs are unsupported/
    );
  });
});

test("every first-party Dockerfile is explicitly represented in the inventory", async () => {
  const inventory = await loadInventory(path.resolve("scripts/image-source-inventory.json"));
  const discovered = await discoverDockerfiles(path.resolve("apps"));
  const inventoryPaths = inventory.recipes.map((recipe) => path.resolve(recipe.dockerfile)).sort();
  assert.deepEqual(discovered, inventoryPaths);
});

test("native image builds name every inventory recipe explicitly", async () => {
  const inventory = await loadInventory(path.resolve("scripts/image-source-inventory.json"));
  const buildScript = await readFile("scripts/build-native-images.sh", "utf8");
  for (const recipe of inventory.recipes)
    assert.match(buildScript, new RegExp(`^build ${recipe.name} `, "m"), `${recipe.name}: native build command`);
});

test("fingerprints ignore generated, cache and test-output files", async () => {
  await withFixture(async ({ root }) => {
    const sourceDirectory = path.join(root, "source");
    await mkdir(path.join(sourceDirectory, "dist"), { recursive: true });
    await mkdir(path.join(sourceDirectory, "__pycache__"), { recursive: true });
    await mkdir(path.join(sourceDirectory, "test-results"), { recursive: true });
    await writeFile(path.join(sourceDirectory, "kept.mjs"), "export const kept = true;\n");
    const recipe = {
      name: "generated-files",
      sourceInputs: ["source"]
    };
    const before = await fingerprintRecipe(root, recipe);
    await writeFile(path.join(sourceDirectory, "dist", "bundle.js"), "generated\n");
    await writeFile(path.join(sourceDirectory, "__pycache__", "module.pyc"), "generated\n");
    await writeFile(path.join(sourceDirectory, "test-results", "result.json"), "generated\n");
    const after = await fingerprintRecipe(root, recipe);
    assert.equal(after.digest, before.digest);
  });
});
