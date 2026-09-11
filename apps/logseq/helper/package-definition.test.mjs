import assert from "node:assert/strict";
import test from "node:test";
import { logseqPackage } from "../package-definition.mjs";

const images = Object.fromEntries(
  ["helper", "mcp", "sync"].map((name) => [name, `ghcr.io/example/${name}@sha256:${"a".repeat(64)}`])
);
test("beta package is explicit, supports both native architectures and keeps editor optional", () => {
  const { manifest, compose } = logseqPackage({
    ...images,
    version: "0.1.0-beta.1",
    architectures: ["amd64", "arm64"],
    beta: true
  });
  assert.equal(manifest.name, "Logseq (Beta)");
  assert.deepEqual(manifest.support.architectures, ["amd64", "arm64"]);
  assert.equal(manifest.variants[0].recommended, true);
  assert.equal(manifest.variants[1].services.includes("editor"), false);
  assert.equal(manifest.lifecycle.removeDataDefault, false);
  assert.deepEqual(manifest.presentation.details.tags, ["Notes", "Knowledge graphs", "Sync"]);
  for (const image of manifest.images) assert.equal(compose.services[image.service].image, image.reference);
  assert.match(manifest.variants[0].limitations.join(" "), /not legacy Markdown/);
});
test("mutable images and unsupported architectures cannot enter a package", () => {
  assert.throws(() => logseqPackage({ ...images, helper: "example:latest", version: "0.1.0" }));
  assert.throws(() => logseqPackage({ ...images, version: "0.1.0", architectures: ["riscv64"] }));
});
