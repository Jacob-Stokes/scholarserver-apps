#!/usr/bin/env node

import { createHash } from "node:crypto";
import { access, lstat, readdir, readFile, realpath } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_INVENTORY = "scripts/image-source-inventory.json";
const IMMUTABLE_REFERENCE = /^[^@\s]+@sha256:[a-f0-9]{64}$/;
const SOURCE_DIGEST = /^sha256:[a-f0-9]{64}$/;
const NATIVE_ARCHITECTURES = new Set(["amd64", "arm64"]);
const IGNORED_DIRECTORY_NAMES = new Set([
  ".dev",
  ".git",
  ".nyc_output",
  ".pytest_cache",
  "coverage",
  "docs",
  "dist",
  "__pycache__",
  "node_modules",
  "official-client",
  "reader-dist",
  "test-output",
  "test-results",
  "vault"
]);
const IGNORED_FILE_NAMES = new Set([".coverage", ".env", ".env.local"]);

function usage() {
  return `Usage: node scripts/check-image-source.mjs [options]

Checks the fixed source inventory and, when --lock is supplied, validates
accepted release records against current source fingerprints.

Options:
  --inventory PATH   Source inventory JSON (default: ${DEFAULT_INVENTORY})
  --root PATH        Exported source root (default: inventory's repository root)
  --lock PATH        Release source-lock JSON; its records are required
  --reference REF    Select the recipe whose current manifest uses this reference
  --recipe NAME      Select a recipe to require; repeat for a bounded release set
  --help             Show this help

Source-lock format 1:
  { "format": 1, "records": [
      { "recipe": "files",
        "reference": "ghcr.io/example/image@sha256:<64 hex>",
        "sourceDigest": "sha256:<64 hex>",
        "nativeArchitectures": ["amd64", "arm64"] }
    ] }

Each selected recipe requires one record whose reference equals that recipe's
selected package-manifest service image. One lock may contain different image
references for different recipes. --reference narrows validation by that
current manifest reference; --recipe narrows it by recipe name.
The lock is a source-record validator, not live image provenance or a registry
attestation. Existing image references are not inferred or accepted as records.
`;
}

function fail(message) {
  throw new Error(message);
}

function parseArguments(argumentsList) {
  const options = { inventory: DEFAULT_INVENTORY, recipes: [] };
  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];
    if (argument === "--help") {
      options.help = true;
      continue;
    }
    if (!["--inventory", "--root", "--lock", "--reference", "--recipe"].includes(argument))
      fail(`Unknown option: ${argument}\n\n${usage()}`);
    const value = argumentsList[index + 1];
    if (!value || value.startsWith("--")) fail(`${argument} requires a value`);
    if (argument === "--recipe") options.recipes.push(value);
    else options[argument.slice(2)] = value;
    index += 1;
  }
  if (options.reference && !options.lock) fail("--reference requires --lock");
  return options;
}

function repositoryRootForInventory(inventoryPath) {
  return path.resolve(path.dirname(inventoryPath), "..");
}

function relativePath(root, candidate) {
  const relative = path.relative(root, candidate);
  const escapesRoot = relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative);
  if (escapesRoot) fail(`Source input escapes exported source root: ${candidate}`);
  return relative.split(path.sep).join("/");
}

function resolveWithinRoot(root, inputPath) {
  const absolutePath = path.resolve(root, inputPath);
  relativePath(root, absolutePath);
  return absolutePath;
}

function isIgnored(relative) {
  const parts = relative.split("/");
  const basename = parts.at(-1);
  return (
    parts.some((part) => IGNORED_DIRECTORY_NAMES.has(part)) ||
    IGNORED_FILE_NAMES.has(basename) ||
    basename.endsWith(".pyc")
  );
}

async function collectFiles(root, inputPath, files) {
  const absolutePath = resolveWithinRoot(root, inputPath);
  const relative = relativePath(root, absolutePath);
  let ancestor = root;
  for (const part of relative.split("/").slice(0, -1)) {
    ancestor = path.join(ancestor, part);
    if ((await lstat(ancestor)).isSymbolicLink()) fail(`Symlink source inputs are unsupported: ${inputPath}`);
  }
  const stats = await lstat(absolutePath).catch(() => null);
  if (!stats) fail(`Missing source input: ${inputPath}`);
  if (stats.isSymbolicLink()) fail(`Symlink source inputs are unsupported: ${inputPath}`);
  if (isIgnored(relative)) return;
  if (stats.isFile()) {
    files.set(relative, absolutePath);
    return;
  }
  if (!stats.isDirectory()) fail(`Source input is not a file or directory: ${inputPath}`);
  const entries = await readdir(absolutePath, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name));
  for (const entry of entries) await collectFiles(root, path.join(inputPath, entry.name), files);
}

export async function fingerprintRecipe(root, recipe) {
  const files = new Map();
  for (const input of recipe.sourceInputs) await collectFiles(root, input, files);
  if (files.size === 0) fail(`Recipe ${recipe.name} has no exported source files in sourceInputs`);

  const digest = createHash("sha256");
  const sortedFiles = [...files.entries()].sort(([left], [right]) => left.localeCompare(right));
  for (const [relative, absolutePath] of sortedFiles) {
    const contents = await readFile(absolutePath);
    const executable = ((await lstat(absolutePath)).mode & 0o111) !== 0;
    digest.update(relative);
    digest.update("\0");
    digest.update(executable ? "executable\0" : "regular\0");
    digest.update(String(contents.byteLength));
    digest.update("\0");
    digest.update(contents);
    digest.update("\0");
  }
  return { digest: `sha256:${digest.digest("hex")}`, files: sortedFiles.map(([relative]) => relative) };
}

export async function discoverDockerfiles(appsRoot) {
  const dockerfiles = [];
  async function visit(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      if (IGNORED_DIRECTORY_NAMES.has(entry.name) || IGNORED_FILE_NAMES.has(entry.name)) continue;
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(entryPath);
      } else if (entry.name.startsWith("Dockerfile") && entry.isFile()) {
        dockerfiles.push(entryPath);
      }
    }
  }
  await visit(appsRoot);
  return dockerfiles.sort();
}

async function readJson(filePath, description) {
  let contents;
  try {
    contents = await readFile(filePath, "utf8");
  } catch (error) {
    fail(`Unable to read ${description} ${filePath}: ${error.message}`);
  }
  try {
    return JSON.parse(contents);
  } catch (error) {
    fail(`Invalid JSON in ${description} ${filePath}: ${error.message}`);
  }
}

export async function loadInventory(inventoryPath) {
  const inventory = await readJson(inventoryPath, "image source inventory");
  if (!inventory || inventory.format !== 1 || !Array.isArray(inventory.recipes))
    fail(`Image source inventory ${inventoryPath} must use format 1 with a recipes array`);
  const names = new Set();
  for (const recipe of inventory.recipes) {
    if (!recipe || typeof recipe !== "object" || typeof recipe.name !== "string")
      fail("Image source inventory contains a recipe without a name");
    if (names.has(recipe.name)) fail(`Duplicate image source inventory recipe: ${recipe.name}`);
    names.add(recipe.name);
    for (const field of ["dockerfile", "context", "repository", "licenseCheck", "manifest", "service"])
      if (typeof recipe[field] !== "string" || recipe[field] === "") fail(`Recipe ${recipe.name} is missing ${field}`);
    if (!Array.isArray(recipe.nativeArchitectures) || recipe.nativeArchitectures.length === 0)
      fail(`Recipe ${recipe.name} is missing nativeArchitectures`);
    if (
      new Set(recipe.nativeArchitectures).size !== recipe.nativeArchitectures.length ||
      recipe.nativeArchitectures.some((architecture) => !NATIVE_ARCHITECTURES.has(architecture))
    )
      fail(`Recipe ${recipe.name} has invalid nativeArchitectures; use amd64 and/or arm64`);
    if (!Array.isArray(recipe.sourceInputs) || recipe.sourceInputs.length === 0)
      fail(`Recipe ${recipe.name} is missing sourceInputs`);
    if (!recipe.sourceInputs.includes(recipe.dockerfile))
      fail(`Recipe ${recipe.name} must fingerprint its Dockerfile: ${recipe.dockerfile}`);
    if (new Set(recipe.sourceInputs).size !== recipe.sourceInputs.length)
      fail(`Recipe ${recipe.name} has duplicate sourceInputs`);
  }
  return inventory;
}

async function readYaml(filePath) {
  // Release assembly checks an exported apps tree without node_modules. In that
  // case use the invoking core checkout's locked build-tool dependency.
  let yaml;
  try {
    yaml = await import("yaml");
  } catch (error) {
    if (error.code !== "ERR_MODULE_NOT_FOUND") throw error;
    yaml = createRequire(path.resolve("package.json"))("yaml");
  }
  const document = yaml.parseDocument(await readFile(filePath, "utf8"), { uniqueKeys: true });
  if (document.errors.length > 0) fail(`Invalid YAML in ${filePath}: ${document.errors[0].message}`);
  return document.toJS({ maxAliasCount: 100 });
}

export async function readManifestImage(root, recipe) {
  const composePath = resolveWithinRoot(root, recipe.manifest);
  const manifestPath = path.join(path.dirname(composePath), "scholarserver-app.yaml");
  const compose = await readYaml(composePath);
  const manifest = await readYaml(manifestPath);
  const reference = compose?.services?.[recipe.service]?.image;
  if (typeof reference !== "string" || !IMMUTABLE_REFERENCE.test(reference))
    fail(`Recipe ${recipe.name} service ${recipe.service} has no immutable Compose image`);
  const declarations = manifest?.images?.filter((image) => image.service === recipe.service) ?? [];
  if (declarations.length !== 1 || declarations[0].reference !== reference)
    fail(`Recipe ${recipe.name} package manifest and Compose image references disagree`);
  return reference;
}

function validateRecordShape(record, index) {
  if (!record || typeof record !== "object") fail(`Source-lock record ${index + 1} is not an object`);
  for (const field of ["recipe", "reference", "sourceDigest"])
    if (typeof record[field] !== "string" || record[field] === "")
      fail(`Source-lock record ${index + 1} is missing ${field}`);
  if (!IMMUTABLE_REFERENCE.test(record.reference))
    fail(`Source-lock record ${index + 1} for ${record.recipe} has a non-immutable reference: ${record.reference}`);
  if (!SOURCE_DIGEST.test(record.sourceDigest))
    fail(`Source-lock record ${index + 1} for ${record.recipe} has an invalid sourceDigest`);
  if (!Array.isArray(record.nativeArchitectures) || record.nativeArchitectures.length === 0)
    fail(`Source-lock record ${index + 1} for ${record.recipe} is missing nativeArchitectures`);
  if (record.nativeArchitectures.some((architecture) => !NATIVE_ARCHITECTURES.has(architecture)))
    fail(`Source-lock record ${index + 1} for ${record.recipe} has invalid nativeArchitectures`);
  if (new Set(record.nativeArchitectures).size !== record.nativeArchitectures.length)
    fail(`Source-lock record ${index + 1} for ${record.recipe} repeats nativeArchitectures`);
}

function sameValues(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

export function validateSourceLock(lock, inventory, fingerprints, requestedReference = null, requestedRecipes = null) {
  if (!lock || lock.format !== 1 || !Array.isArray(lock.records))
    fail("Release source-lock must use format 1 with a records array");
  const recipes = new Map(inventory.recipes.map((recipe) => [recipe.name, recipe]));
  const requestedRecipeNames = requestedRecipes?.length ? [...new Set(requestedRecipes)] : [...recipes.keys()];
  for (const recipeName of requestedRecipeNames)
    if (!recipes.has(recipeName)) fail(`Source-lock selection names unknown recipe: ${recipeName}`);
  if (requestedReference && !IMMUTABLE_REFERENCE.test(requestedReference))
    fail(`Requested source-lock reference is not immutable: ${requestedReference}`);
  const selectedRecipeNames = requestedReference
    ? requestedRecipeNames.filter(
        (recipeName) => fingerprints.get(recipeName)?.manifestReference === requestedReference
      )
    : requestedRecipeNames;
  if (requestedReference && selectedRecipeNames.length === 0)
    fail(
      `Requested source-lock reference ${requestedReference} does not match the current package manifest image for selected recipe(s): ${requestedRecipeNames.join(", ")}`
    );
  const selectedRecipes = selectedRecipeNames.map((recipeName) => recipes.get(recipeName));
  const recordsByKey = new Map();
  for (const [index, record] of lock.records.entries()) {
    validateRecordShape(record, index);
    if (!recipes.has(record.recipe)) fail(`Source-lock record names unknown recipe: ${record.recipe}`);
    const key = `${record.reference}\0${record.recipe}`;
    if (recordsByKey.has(key))
      fail(`Duplicate source-lock record for recipe ${record.recipe} and reference ${record.reference}`);
    recordsByKey.set(key, record);
  }

  const errors = [];
  for (const recipe of selectedRecipes) {
    const fingerprint = fingerprints.get(recipe.name);
    const expectedReference = fingerprint.manifestReference;
    if (!expectedReference) errors.push(`missing current package manifest image for recipe ${recipe.name}`);
    const recordsForRecipe = lock.records.filter((record) => record.recipe === recipe.name);
    for (const record of recordsForRecipe) {
      if (expectedReference && record.reference !== expectedReference)
        errors.push(
          `source-lock reference mismatch for recipe ${recipe.name}: recorded ${record.reference}, current package manifest ${expectedReference}`
        );
    }
    const record = expectedReference ? recordsByKey.get(`${expectedReference}\0${recipe.name}`) : null;
    if (!record) {
      errors.push(
        `missing source-lock record for recipe ${recipe.name} (current package manifest reference ${expectedReference ?? "unavailable"})`
      );
      continue;
    }
    if (record.sourceDigest !== fingerprint.digest)
      errors.push(
        `stale source-lock record for recipe ${recipe.name}: recorded ${record.sourceDigest}, current ${fingerprint.digest}`
      );
    const expectedArchitectures = [...recipe.nativeArchitectures].sort();
    const recordedArchitectures = [...record.nativeArchitectures].sort();
    if (!sameValues(recordedArchitectures, expectedArchitectures)) {
      const missing = expectedArchitectures.filter((architecture) => !recordedArchitectures.includes(architecture));
      const extra = recordedArchitectures.filter((architecture) => !expectedArchitectures.includes(architecture));
      if (missing.length > 0)
        errors.push(
          `incomplete source-lock record for recipe ${recipe.name}: missing native architecture(s) ${missing.join(", ")}`
        );
      if (extra.length > 0)
        errors.push(
          `invalid source-lock record for recipe ${recipe.name}: unexpected native architecture(s) ${extra.join(", ")}`
        );
    }
  }
  if (errors.length > 0) fail(errors.join("\n"));
  return { recipes: selectedRecipes.length };
}

async function checkInventory(inventoryPath, rootPath) {
  const inventory = await loadInventory(inventoryPath);
  const root = path.resolve(rootPath);
  const discoveredDockerfiles = await discoverDockerfiles(resolveWithinRoot(root, "apps"));
  const inventoryDockerfiles = new Set(inventory.recipes.map((recipe) => resolveWithinRoot(root, recipe.dockerfile)));
  const missingRecipes = discoveredDockerfiles
    .filter((dockerfile) => !inventoryDockerfiles.has(dockerfile))
    .map((dockerfile) => path.relative(root, dockerfile).split(path.sep).join("/"));
  if (missingRecipes.length > 0)
    fail(`Dockerfile(s) are missing from image source inventory; add named recipe(s): ${missingRecipes.join(", ")}`);
  const fingerprints = new Map();
  for (const recipe of inventory.recipes) {
    await access(resolveWithinRoot(root, recipe.dockerfile)).catch(() =>
      fail(`Recipe ${recipe.name} Dockerfile is missing: ${recipe.dockerfile}`)
    );
    await access(resolveWithinRoot(root, recipe.context)).catch(() =>
      fail(`Recipe ${recipe.name} build context is missing: ${recipe.context}`)
    );
    await access(resolveWithinRoot(root, recipe.licenseCheck)).catch(() =>
      fail(`Recipe ${recipe.name} license check is missing: ${recipe.licenseCheck}`)
    );
    const dockerfile = await readFile(resolveWithinRoot(root, recipe.dockerfile), "utf8");
    const fromLines = dockerfile.split("\n").filter((line) => line.startsWith("FROM "));
    if (fromLines.length === 0 || fromLines.some((line) => !/@sha256:[a-f0-9]{64}(?: AS \S+)?$/.test(line)))
      fail(`Recipe ${recipe.name} must keep every Dockerfile base pinned by digest`);
    const fingerprint = await fingerprintRecipe(root, recipe);
    fingerprint.manifestReference = await readManifestImage(root, recipe);
    const manifestRepository = fingerprint.manifestReference
      .slice(0, fingerprint.manifestReference.indexOf("@"))
      .split("/")
      .at(-1);
    if (manifestRepository !== recipe.repository)
      fail(
        `Recipe ${recipe.name} repository ${recipe.repository} does not match package manifest image ${fingerprint.manifestReference}`
      );
    fingerprints.set(recipe.name, fingerprint);
  }
  return { inventory, fingerprints };
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(usage());
    return;
  }
  const inventoryPath = path.resolve(options.inventory);
  const rootPath = options.root ? path.resolve(options.root) : repositoryRootForInventory(inventoryPath);
  const { inventory, fingerprints } = await checkInventory(inventoryPath, rootPath);
  if (options.lock) {
    const lock = await readJson(path.resolve(options.lock), "release source-lock");
    const result = validateSourceLock(lock, inventory, fingerprints, options.reference ?? null, options.recipes);
    process.stdout.write(
      `Validated ${result.recipes} image source-lock records against current package manifest images.\n`
    );
    return;
  }
  process.stdout.write(`Validated ${inventory.recipes.length} image recipes and their fixed source inputs.\n`);
}

// Node resolves the module path, while argv can retain a directory symlink
// (including macOS /tmp). Both paths must identify the same real file.
const invokedPath = process.argv[1] ? await realpath(process.argv[1]).catch(() => null) : null;
const modulePath = await realpath(fileURLToPath(import.meta.url));
if (invokedPath && modulePath === invokedPath) {
  main().catch((error) => {
    process.stderr.write(`Image source check failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}
