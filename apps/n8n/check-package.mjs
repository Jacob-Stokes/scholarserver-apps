import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parse } from "yaml";

// This acceptance test is app-owned, not another package schema. Stop when the
// declared setup changes so its native test cannot silently exercise old input.
export function packageTestImages(manifest, compose) {
  assert.equal(manifest.id, "org.scholarserver.n8n");
  const setup = manifest.onboarding.actions.find((action) => action.id === "setup");
  assert.equal(setup?.provisionServiceAccess, true, "Native setup must exercise the Manager service credential");
  assert.deepEqual(
    setup.fields.filter((field) => field.required).map((field) => field.id),
    ["password"],
    "Update native acceptance when required setup fields change"
  );
  const references = new Map();
  for (const image of manifest.images) {
    assert.ok(!references.has(image.service), "Duplicate package image service");
    assert.match(image.reference, /^[^\s@]+@sha256:[a-f0-9]{64}$/);
    assert.equal(compose.services[image.service]?.image, image.reference, "Compose and manifest images must match");
    references.set(image.service, image.reference);
  }
  assert.deepEqual([...references.keys()].sort(), ["integration", "n8n"]);
  assert.deepEqual(Object.keys(compose.services).sort(), ["integration", "n8n"]);
  return { N8N_IMAGE: references.get("n8n"), INTEGRATION_IMAGE: references.get("integration") };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const repository = fileURLToPath(new URL("../../", import.meta.url));
  const packageDirectory = path.resolve(process.argv[2] ?? path.join(repository, "apps/n8n/package"));
  const manifest = parse(readFileSync(path.join(packageDirectory, "scholarserver-app.yaml"), "utf8"));
  const compose = parse(readFileSync(path.join(packageDirectory, "compose.yaml"), "utf8"));
  const images = packageTestImages(manifest, compose);
  for (const reference of Object.values(images)) {
    execFileSync("docker", ["pull", reference], { stdio: "inherit" });
  }
  execFileSync("bash", ["apps/n8n/test-container.sh"], {
    cwd: repository,
    env: { ...process.env, ...images },
    stdio: "inherit"
  });
}
