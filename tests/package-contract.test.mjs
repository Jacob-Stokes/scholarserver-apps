import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const applicationsRoot = path.join(repositoryRoot, "apps");

async function packages() {
  const entries = await readdir(applicationsRoot, { withFileTypes: true });
  const result = [];
  for (const entry of entries.filter((candidate) => candidate.isDirectory())) {
    const packageRoot = path.join(applicationsRoot, entry.name, "package");
    try {
      const [manifestText, composeText] = await Promise.all([
        readFile(path.join(packageRoot, "scholarserver-app.yaml"), "utf8"),
        readFile(path.join(packageRoot, "compose.yaml"), "utf8")
      ]);
      result.push({ directory: entry.name, manifest: parse(manifestText), compose: parse(composeText) });
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }
  return result;
}

function unique(values, label) {
  assert.equal(new Set(values).size, values.length, `${label} must be unique`);
}

test("every first-party package satisfies the reusable package boundary", async () => {
  const discovered = await packages();
  assert.ok(discovered.length > 0, "at least one first-party package must be discovered");
  unique(
    discovered.map(({ manifest }) => manifest.id),
    "package ids"
  );

  for (const { directory, manifest, compose } of discovered) {
    const label = `${directory} (${manifest.id})`;
    const services = new Set(Object.keys(compose.services ?? {}));
    const data = new Set((manifest.data ?? []).map((entry) => entry.id));
    const endpoints = new Map((manifest.endpoints ?? []).map((entry) => [entry.id, entry]));

    assert.equal(manifest.support.tier, "official", `${label}: first-party support tier`);
    assert.ok(manifest.support.architectures.includes("amd64"), `${label}: amd64 support`);
    assert.ok(manifest.support.architectures.includes("arm64"), `${label}: arm64 support`);
    unique([...services], `${label}: compose service names`);
    unique([...data], `${label}: data ids`);
    unique([...endpoints.keys()], `${label}: endpoint ids`);

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
