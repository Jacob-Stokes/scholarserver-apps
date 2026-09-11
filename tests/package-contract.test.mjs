import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { lstat, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const applicationsRoot = path.join(repositoryRoot, "apps");
const iconLock = JSON.parse(await readFile(path.join(repositoryRoot, "icons.lock.json"), "utf8"));
const catalogTagVocabulary = new Set([
  "Automation",
  "Documents",
  "Files",
  "Knowledge graphs",
  "News & feeds",
  "Notes",
  "PDF conversion",
  "References",
  "Sync",
  "Vaults"
]);
const maximumCatalogTags = 6;
const maximumCatalogTagLength = 32;

async function packages(root = applicationsRoot) {
  const entries = await readdir(root, { withFileTypes: true });
  const result = [];
  for (const entry of entries.filter((candidate) => candidate.isDirectory())) {
    const packageRoot = path.join(root, entry.name, "package");
    try {
      await lstat(packageRoot);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      continue; // Source-only app directories do not declare a package yet.
    }
    const [manifestText, composeText] = await Promise.all([
      readFile(path.join(packageRoot, "scholarserver-app.yaml"), "utf8"),
      readFile(path.join(packageRoot, "compose.yaml"), "utf8")
    ]);
    result.push({ directory: entry.name, manifest: parse(manifestText), compose: parse(composeText) });
  }
  return result;
}

function unique(values, label) {
  assert.equal(new Set(values).size, values.length, `${label} must be unique`);
}

function checkDeclaredIds(manifest, label) {
  for (const field of ["data", "endpoints", "images"]) {
    const key = field === "images" ? "service" : "id";
    unique(
      (manifest[field] ?? []).map((entry) => entry[key]),
      `${label}: ${field} ${key}s`
    );
  }
}

function checkCatalogTags(manifest, label) {
  const tags = manifest.presentation?.details?.tags;
  assert.ok(Array.isArray(tags) && tags.length > 0, `${label}: catalog tags are required`);
  assert.ok(tags.length <= maximumCatalogTags, `${label}: too many catalog tags`);

  const normalizedTags = tags.map((tag) => {
    assert.equal(typeof tag, "string", `${label}: catalog tags must be strings`);
    assert.ok(tag.length > 0 && tag.length <= maximumCatalogTagLength, `${label}: catalog tag length`);
    assert.equal(tag, tag.trim(), `${label}: catalog tags must not have surrounding whitespace`);
    assert.ok(catalogTagVocabulary.has(tag), `${label}: catalog tag is outside the controlled vocabulary: ${tag}`);
    return tag.toLocaleLowerCase();
  });
  unique(normalizedTags, `${label}: catalog tags`);
}

test("package discovery rejects incomplete packages but allows source-only directories", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "scholarserver-package-contract-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, "source-only"));
  assert.deepEqual(await packages(root), []);
  const packageRoot = path.join(root, "candidate", "package");
  await mkdir(packageRoot, { recursive: true });
  await assert.rejects(packages(root), { code: "ENOENT" });
  await writeFile(path.join(packageRoot, "scholarserver-app.yaml"), "id: candidate\n");
  await assert.rejects(packages(root), { code: "ENOENT" });
  await writeFile(path.join(packageRoot, "compose.yaml"), "services: {}\n");
  assert.equal((await packages(root)).length, 1);
});

test("duplicate declarations are rejected before building lookup sets and maps", () => {
  for (const field of ["data", "endpoints", "images"]) {
    const key = field === "images" ? "service" : "id";
    assert.throws(
      () => checkDeclaredIds({ [field]: [{ [key]: "same" }, { [key]: "same" }] }, "candidate"),
      /must be unique/
    );
    checkDeclaredIds({ [field]: [{ [key]: "one" }, { [key]: "two" }] }, "candidate");
  }
});

test("app-owned main screens reuse shared presentation instead of copying the platform frame", async () => {
  const entries = await readdir(applicationsRoot, { withFileTypes: true });
  let checked = 0;
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    let source;
    try {
      source = await readFile(path.join(applicationsRoot, entry.name, "ui", "src", "App.tsx"), "utf8");
    } catch (error) {
      if (error.code === "ENOENT") continue; // Not every package has a ScholarServer-owned screen.
      throw error;
    }
    assert.match(source, /import \{ ApplicationScreen \} from "@scholarserver\/ui\/application-screen"/, entry.name);
    assert.match(source, /<ApplicationScreen[\s>]/, entry.name);
    assert.doesNotMatch(source, /className="ss-app-header"/, `${entry.name}: header must stay shared`);
    checked++;
  }
  assert.ok(checked > 0, "At least one app-owned main screen was checked");
});

test("every first-party package satisfies the reusable package boundary", async () => {
  const discovered = await packages();
  assert.ok(discovered.length > 0, "at least one first-party package must be discovered");
  unique(
    discovered.map(({ manifest }) => manifest.id),
    "package ids"
  );

  for (const { directory, manifest, compose } of discovered) {
    const label = `${directory} (${manifest.id})`;
    checkDeclaredIds(manifest, label);
    const services = new Set(Object.keys(compose.services ?? {}));
    const data = new Set((manifest.data ?? []).map((entry) => entry.id));
    const endpoints = new Map((manifest.endpoints ?? []).map((entry) => [entry.id, entry]));

    assert.equal(manifest.support.tier, "official", `${label}: first-party support tier`);
    assert.ok(manifest.support.architectures.includes("amd64"), `${label}: amd64 support`);
    assert.ok(manifest.support.architectures.includes("arm64"), `${label}: arm64 support`);

    assert.ok(manifest.presentation?.icon, `${label}: packaged application icon`);
    const lockedIcon = iconLock.icons[directory];
    assert.ok(lockedIcon, `${label}: icon is pinned in icons.lock.json`);
    assert.equal(manifest.presentation.icon.mediaType, "image/webp", `${label}: safe raster icon format`);
    assert.equal(manifest.presentation.icon.attribution.license, iconLock.upstream.license, `${label}: icon license`);
    const iconPath = path.join(applicationsRoot, directory, "package", manifest.presentation.icon.path);
    const iconInformation = await lstat(iconPath);
    assert.ok(iconInformation.isFile() && !iconInformation.isSymbolicLink(), `${label}: icon is a regular file`);
    const iconDigest = createHash("sha256")
      .update(await readFile(iconPath))
      .digest("hex");
    assert.equal(iconDigest, lockedIcon.sha256, `${label}: packaged icon matches its pinned upstream asset`);

    for (const image of manifest.images ?? []) {
      assert.ok(services.has(image.service), `${label}: image service ${image.service} exists in Compose`);
      assert.match(image.reference, /@sha256:[a-f0-9]{64}$/, `${label}: image ${image.service} is digest pinned`);
    }
    for (const endpoint of endpoints.values()) {
      assert.ok(services.has(endpoint.service), `${label}: endpoint ${endpoint.id} references a Compose service`);
      if (endpoint.gateway) {
        const aliases = compose.services[endpoint.service]?.networks?.instance?.aliases ?? [];
        assert.ok(
          aliases.includes(endpoint.gateway.hostname),
          `${label}: gateway hostname is a stable instance-network alias`
        );
      }
    }
    if (manifest.ui) {
      assert.ok(endpoints.has(manifest.ui.endpoint), `${label}: UI endpoint exists`);
      assert.equal(
        endpoints.get(manifest.ui.endpoint).auth,
        "platform-session",
        `${label}: UI uses the platform session boundary`
      );
    }
    for (const action of manifest.onboarding?.actions ?? []) {
      assert.ok(data.has(action.data), `${label}: action ${action.id} references declared data`);
      unique(
        (action.fields ?? []).map((field) => field.id),
        `${label}: action ${action.id} field ids`
      );
    }

    const variants = manifest.variants ?? [];
    if (variants.length > 0) {
      unique(
        variants.map((variant) => variant.id),
        `${label}: setup choice ids`
      );
      assert.equal(
        variants.filter((variant) => variant.recommended).length,
        1,
        `${label}: exactly one setup choice is recommended`
      );
      const coveredServices = new Set();
      for (const variant of variants) {
        unique(variant.services, `${label}: ${variant.id} services`);
        unique(variant.data, `${label}: ${variant.id} data`);
        for (const service of variant.services) {
          assert.ok(services.has(service), `${label}: ${variant.id} selects known service ${service}`);
          coveredServices.add(service);
          const dependency = compose.services[service]?.network_mode;
          if (typeof dependency === "string" && dependency.startsWith("service:")) {
            assert.ok(
              variant.services.includes(dependency.slice("service:".length)),
              `${label}: ${variant.id} includes network namespace owner ${dependency}`
            );
          }
        }
        for (const dataId of variant.data) {
          assert.ok(data.has(dataId), `${label}: ${variant.id} selects known data ${dataId}`);
        }
        const uiService = manifest.ui ? endpoints.get(manifest.ui.endpoint)?.service : null;
        if (uiService)
          assert.ok(variant.services.includes(uiService), `${label}: ${variant.id} keeps its declared UI available`);
        const gatewayServices = [...endpoints.values()]
          .filter((endpoint) => endpoint.gateway)
          .map((endpoint) => endpoint.service);
        for (const gatewayService of gatewayServices) {
          assert.ok(
            variant.services.includes(gatewayService),
            `${label}: ${variant.id} keeps its declared MCP gateway available`
          );
        }
      }
      assert.deepEqual(
        [...coveredServices].sort(),
        [...services].sort(),
        `${label}: every Compose service belongs to at least one setup choice`
      );
    }
  }
});

test("every first-party package declares bounded unique catalog tags", async () => {
  const discovered = await packages();
  assert.ok(discovered.length > 0, "at least one first-party package must be discovered");

  for (const { directory, manifest } of discovered) {
    checkCatalogTags(manifest, `${directory} (${manifest.id})`);
  }
});
