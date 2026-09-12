#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, realpath, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fingerprintRecipe, loadInventory } from "./check-image-source.mjs";

const FULL_GIT_SHA = /^[a-f0-9]{40}$/;
const SHA256 = /^sha256:[a-f0-9]{64}$/;
const ARCHITECTURES = new Set(["amd64", "arm64"]);
const QUALIFICATION_SCOPES = [
  "Files container and restart checks",
  "Obsidian native startup, user download and two-peer LiveSync check",
  "FreshRSS setup, MCP, restart and restore check",
  "n8n password-only setup and controller restart check"
];

function fail(message) {
  throw new Error(message);
}

function usage() {
  return `Usage: node scripts/native-image-receipt.mjs COMMAND [options]

Commands:
  assert-source     Require a clean committed HEAD matching --revision
  fingerprint       Print the current source digest for --recipe
  write-receipt     Create a format-1 receipt from --records
  verify-receipt    Recheck a receipt and print tab-separated image records
  write-qualification  Bind the named native gates to a build receipt
  verify-qualification Require a matching named-gate qualification
  verify-remote     Match a remote manifest to recorded portable image identity
  compare-manifest  Compare --existing manifest JSON with repeated --source files
`;
}

function parseArguments(argumentsList) {
  const command = argumentsList[0];
  if (!command || command === "--help") return { help: true };
  const options = { command, sources: [] };
  for (let index = 1; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];
    const value = argumentsList[index + 1];
    if (!argument.startsWith("--") || !value || value.startsWith("--")) fail(`Invalid option: ${argument}`);
    if (argument === "--source") options.sources.push(value);
    else options[argument.slice(2)] = value;
    index += 1;
  }
  return options;
}

function required(options, name) {
  const value = options[name];
  if (typeof value !== "string" || value === "") fail(`--${name} is required`);
  return value;
}

function git(root, argumentsList) {
  try {
    return execFileSync("git", argumentsList, {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    }).trim();
  } catch (error) {
    const detail = error.stderr?.trim() || error.message;
    fail(`Git source check failed: ${detail}`);
  }
}

export function assertFullRevision(revision) {
  if (!FULL_GIT_SHA.test(revision)) fail("REVISION must be the full lowercase 40-character Git commit SHA");
}

export function assertArchitecture(architecture) {
  if (!ARCHITECTURES.has(architecture)) fail(`Unsupported native architecture: ${architecture}`);
}

export function assertCleanCommittedHead(root, revision) {
  assertFullRevision(revision);
  const repositoryRoot = path.resolve(git(root, ["rev-parse", "--show-toplevel"]));
  if (repositoryRoot !== path.resolve(root))
    fail(`Expected repository root ${path.resolve(root)}, found ${repositoryRoot}`);
  const head = git(root, ["rev-parse", "--verify", "HEAD^{commit}"]);
  if (head !== revision) fail(`REVISION ${revision} does not match committed HEAD ${head}`);
  const status = git(root, ["status", "--porcelain=v1", "--untracked-files=all", "--ignored=no"]);
  if (status) fail(`Working tree is not clean; commit or remove tracked and nonignored untracked changes:\n${status}`);
  return head;
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

async function fileDigest(filePath) {
  return `sha256:${createHash("sha256")
    .update(await readFile(filePath))
    .digest("hex")}`;
}

function expectedTarget(registry, recipe, revision, architecture) {
  const prefix = registry.replace(/\/$/, "");
  const variant = recipe.variant ? `-${recipe.variant}` : "";
  return `${prefix}/${recipe.repository}:sha-${revision}${variant}-${architecture}`;
}

function validateReceiptShape(receipt, inventory, { revision, architecture, registry }) {
  if (!receipt || receipt.format !== 1 || !Array.isArray(receipt.images))
    fail("Native image receipt must use format 1 with an images array");
  if (receipt.revision !== revision) fail(`Receipt revision ${receipt.revision} does not match ${revision}`);
  if (receipt.architecture !== architecture)
    fail(`Receipt architecture ${receipt.architecture} does not match ${architecture}`);
  if (receipt.registry !== registry.replace(/\/$/, ""))
    fail(`Receipt registry ${receipt.registry} does not match ${registry}`);
  if (receipt.images.length !== inventory.recipes.length)
    fail(`Receipt has ${receipt.images.length} images; inventory requires ${inventory.recipes.length}`);

  const images = new Map();
  for (const image of receipt.images) {
    if (!image || typeof image.recipe !== "string") fail("Receipt contains an image without a recipe name");
    if (images.has(image.recipe)) fail(`Receipt repeats recipe ${image.recipe}`);
    if (!SHA256.test(image.localImageId)) fail(`Receipt has an invalid local image ID for ${image.recipe}`);
    if (!SHA256.test(image.configDigest)) fail(`Receipt has an invalid config digest for ${image.recipe}`);
    if (image.architecture !== architecture)
      fail(`Receipt image architecture mismatch for ${image.recipe}: ${image.architecture}`);
    if (
      !Array.isArray(image.rootfsDiffIds) ||
      image.rootfsDiffIds.length === 0 ||
      image.rootfsDiffIds.some((value) => !SHA256.test(value))
    )
      fail(`Receipt has invalid RootFS diff IDs for ${image.recipe}`);
    if (!SHA256.test(image.sourceDigest)) fail(`Receipt has an invalid source digest for ${image.recipe}`);
    images.set(image.recipe, image);
  }
  for (const recipe of inventory.recipes) {
    const image = images.get(recipe.name);
    if (!image) fail(`Receipt is missing recipe ${recipe.name}`);
    if (!recipe.nativeArchitectures.includes(architecture))
      fail(`Recipe ${recipe.name} does not support native architecture ${architecture}`);
    const target = expectedTarget(registry, recipe, revision, architecture);
    if (image.target !== target)
      fail(`Receipt target mismatch for ${recipe.name}: expected ${target}, found ${image.target}`);
  }
  return images;
}

async function readRecords(recordsPath) {
  const records = [];
  const contents = await readFile(recordsPath, "utf8");
  for (const [index, line] of contents.split("\n").entries()) {
    if (!line) continue;
    const fields = line.split("\t");
    if (fields.length !== 7) fail(`Invalid build record on line ${index + 1}`);
    const [recipe, target, localImageId, configDigest, architecture, rootfsValue, sourceDigest] = fields;
    const rootfsDiffIds = rootfsValue.split(",").filter(Boolean);
    records.push({ recipe, target, localImageId, configDigest, architecture, rootfsDiffIds, sourceDigest });
  }
  return records;
}

async function verifyFingerprints(root, inventory, images, selectedRecipe = null) {
  if (selectedRecipe && !images.has(selectedRecipe)) fail(`Receipt does not contain recipe ${selectedRecipe}`);
  const recipes = selectedRecipe
    ? inventory.recipes.filter((recipe) => recipe.name === selectedRecipe)
    : inventory.recipes;
  for (const recipe of recipes) {
    const current = await fingerprintRecipe(root, recipe);
    const recorded = images.get(recipe.name).sourceDigest;
    if (current.digest !== recorded)
      fail(`Source changed after build for ${recipe.name}: receipt ${recorded}, current ${current.digest}`);
  }
}

async function writeReceipt(options) {
  const root = path.resolve(options.root ?? ".");
  const revision = required(options, "revision");
  const architecture = required(options, "architecture");
  const registry = required(options, "registry").replace(/\/$/, "");
  assertArchitecture(architecture);
  assertCleanCommittedHead(root, revision);
  const inventory = await loadInventory(path.resolve(root, required(options, "inventory")));
  const records = await readRecords(path.resolve(root, required(options, "records")));
  const draft = { format: 1, revision, architecture, registry, images: records };
  const images = validateReceiptShape(draft, inventory, { revision, architecture, registry });
  await verifyFingerprints(root, inventory, images);

  const receiptPath = path.resolve(root, required(options, "receipt"));
  const receipt = {
    ...draft,
    createdAt: new Date().toISOString(),
    images: inventory.recipes.map((recipe) => images.get(recipe.name))
  };
  await mkdir(path.dirname(receiptPath), { recursive: true });
  const temporaryPath = `${receiptPath}.tmp-${process.pid}`;
  await writeFile(temporaryPath, `${JSON.stringify(receipt, null, 2)}\n`, { flag: "wx" });
  await rename(temporaryPath, receiptPath);
  process.stdout.write(`${receiptPath}\n`);
}

async function verifiedReceiptContext(options) {
  const root = path.resolve(options.root ?? ".");
  const revision = required(options, "revision");
  const architecture = required(options, "architecture");
  const registry = required(options, "registry").replace(/\/$/, "");
  assertArchitecture(architecture);
  assertCleanCommittedHead(root, revision);
  const inventory = await loadInventory(path.resolve(root, required(options, "inventory")));
  const receipt = await readJson(path.resolve(root, required(options, "receipt")), "native image receipt");
  const images = validateReceiptShape(receipt, inventory, { revision, architecture, registry });
  await verifyFingerprints(root, inventory, images, options.recipe ?? null);
  return { root, revision, architecture, registry, inventory, receipt, images };
}

async function verifyReceipt(options) {
  const { inventory, images } = await verifiedReceiptContext(options);
  const selected = options.recipe
    ? inventory.recipes.filter((recipe) => recipe.name === options.recipe)
    : inventory.recipes;
  for (const recipe of selected) {
    const image = images.get(recipe.name);
    process.stdout.write(
      [
        image.recipe,
        image.target,
        image.localImageId,
        image.configDigest,
        image.architecture,
        image.rootfsDiffIds.join(","),
        String(image.rootfsDiffIds.length),
        image.sourceDigest
      ].join("\t") + "\n"
    );
  }
}

async function writeQualification(options) {
  const context = await verifiedReceiptContext(options);
  const receiptPath = path.resolve(context.root, required(options, "receipt"));
  const qualificationPath = path.resolve(context.root, required(options, "qualification"));
  const qualification = {
    format: 1,
    revision: context.revision,
    architecture: context.architecture,
    registry: context.registry,
    buildReceiptDigest: await fileDigest(receiptPath),
    scopes: QUALIFICATION_SCOPES,
    qualifiedAt: new Date().toISOString()
  };
  await mkdir(path.dirname(qualificationPath), { recursive: true });
  const temporaryPath = `${qualificationPath}.tmp-${process.pid}`;
  await writeFile(temporaryPath, `${JSON.stringify(qualification, null, 2)}\n`, { flag: "wx" });
  await rename(temporaryPath, qualificationPath);
  process.stdout.write(`${qualificationPath}\n`);
}

async function verifyQualification(options) {
  const context = await verifiedReceiptContext(options);
  const receiptPath = path.resolve(context.root, required(options, "receipt"));
  const qualificationPath = path.resolve(context.root, required(options, "qualification"));
  const qualification = await readJson(qualificationPath, "native test qualification");
  if (!qualification || qualification.format !== 1) fail("Native test qualification must use format 1");
  for (const field of ["revision", "architecture", "registry"]) {
    if (qualification[field] !== context[field])
      fail(`Native test qualification ${field} does not match the build receipt`);
  }
  const currentReceiptDigest = await fileDigest(receiptPath);
  if (qualification.buildReceiptDigest !== currentReceiptDigest)
    fail("Native test qualification does not match the current build receipt");
  if (JSON.stringify(qualification.scopes) !== JSON.stringify(QUALIFICATION_SCOPES))
    fail("Native test qualification does not contain the exact named gate scopes");
}

function collectDescriptors(value) {
  const values = Array.isArray(value) ? value : [value];
  const descriptors = [];
  for (const item of values) {
    if (Array.isArray(item?.manifests)) descriptors.push(...item.manifests);
    else if (item?.Descriptor) descriptors.push(item.Descriptor);
    else if (item?.digest && item?.platform) descriptors.push(item);
  }
  return descriptors;
}

function descriptorKey(descriptor) {
  if (!SHA256.test(descriptor?.digest)) fail("Manifest descriptor is missing a SHA-256 digest");
  const architecture = descriptor?.platform?.architecture;
  const operatingSystem = descriptor?.platform?.os;
  if (!architecture || !operatingSystem) fail("Manifest descriptor is missing its platform");
  const variant = descriptor.platform.variant ? `/${descriptor.platform.variant}` : "";
  return `${operatingSystem}/${architecture}${variant}:${descriptor.digest}`;
}

async function compareManifest(options) {
  if (options.sources.length === 0) fail("compare-manifest requires at least one --source file");
  const existing = collectDescriptors(await readJson(required(options, "existing"), "existing manifest"));
  const sources = [];
  for (const source of options.sources) sources.push(...collectDescriptors(await readJson(source, "source manifest")));
  const existingKeys = existing.map(descriptorKey).sort();
  const sourceKeys = sources.map(descriptorKey).sort();
  if (existingKeys.length !== sourceKeys.length || existingKeys.some((value, index) => value !== sourceKeys[index]))
    fail(
      `Immutable manifest already exists with different content:\nexisting ${existingKeys.join(", ")}\nrequested ${sourceKeys.join(", ")}`
    );
}

async function verifyRemote(options) {
  const value = await readJson(required(options, "input"), "remote image manifest");
  const expectedArchitecture = required(options, "architecture");
  assertArchitecture(expectedArchitecture);
  let manifest;
  if (Array.isArray(value)) {
    const platformImages = value.filter(
      (item) =>
        item?.Descriptor?.platform?.os === "linux" &&
        item.Descriptor.platform.architecture === expectedArchitecture &&
        item?.SchemaV2Manifest
    );
    if (platformImages.length !== 1)
      fail(`Remote image index has ${platformImages.length} runnable ${expectedArchitecture} manifests`);
    manifest = platformImages[0].SchemaV2Manifest;
  } else if (value?.SchemaV2Manifest) {
    const platform = value.Descriptor?.platform;
    if (platform && (platform.os !== "linux" || platform.architecture !== expectedArchitecture))
      fail(`Remote image platform does not match linux/${expectedArchitecture}`);
    manifest = value.SchemaV2Manifest;
  } else {
    manifest = value;
  }
  const expectedConfigDigest = required(options, "config-digest");
  if (!SHA256.test(expectedConfigDigest)) fail("--config-digest must be a SHA-256 digest");
  if (manifest?.config?.digest !== expectedConfigDigest)
    fail(`Remote config digest ${manifest?.config?.digest ?? "missing"} does not match ${expectedConfigDigest}`);
  const layers = manifest?.layers;
  if (!Array.isArray(layers) || layers.length === 0 || layers.some((layer) => !SHA256.test(layer?.digest)))
    fail("Remote image manifest has invalid layer descriptors");
  const expectedLayerCount = Number.parseInt(required(options, "layer-count"), 10);
  if (!Number.isSafeInteger(expectedLayerCount) || expectedLayerCount <= 0)
    fail("--layer-count must be a positive integer");
  if (layers.length !== expectedLayerCount)
    fail(`Remote layer count ${layers.length} does not match recorded RootFS layer count ${expectedLayerCount}`);
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(usage());
    return;
  }
  if (options.command === "assert-source") {
    assertCleanCommittedHead(path.resolve(options.root ?? "."), required(options, "revision"));
  } else if (options.command === "fingerprint") {
    const root = path.resolve(options.root ?? ".");
    const inventory = await loadInventory(path.resolve(root, required(options, "inventory")));
    const recipeName = required(options, "recipe");
    const recipe = inventory.recipes.find((entry) => entry.name === recipeName);
    if (!recipe) fail(`Unknown image recipe: ${recipeName}`);
    process.stdout.write(`${(await fingerprintRecipe(root, recipe)).digest}\n`);
  } else if (options.command === "write-receipt") {
    await writeReceipt(options);
  } else if (options.command === "verify-receipt") {
    await verifyReceipt(options);
  } else if (options.command === "write-qualification") {
    await writeQualification(options);
  } else if (options.command === "verify-qualification") {
    await verifyQualification(options);
  } else if (options.command === "verify-remote") {
    await verifyRemote(options);
  } else if (options.command === "compare-manifest") {
    await compareManifest(options);
  } else {
    fail(`Unknown command: ${options.command}\n\n${usage()}`);
  }
}

// argv can retain a symlinked directory while Node resolves the module itself.
// Compare canonical paths so invoking this guard through /tmp or another alias
// cannot silently skip the CLI checks.
const invokedPath = process.argv[1] ? await realpath(process.argv[1]).catch(() => null) : null;
const modulePath = await realpath(fileURLToPath(import.meta.url));
if (invokedPath && invokedPath === modulePath) {
  main().catch((error) => {
    process.stderr.write(`Native image receipt failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}
