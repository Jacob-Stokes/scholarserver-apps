import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parse } from "yaml";
import { packageTestImages } from "../check-package.mjs";

function packageDocuments() {
  return {
    manifest: parse(readFileSync(new URL("../package/scholarserver-app.yaml", import.meta.url), "utf8")),
    compose: parse(readFileSync(new URL("../package/compose.yaml", import.meta.url), "utf8"))
  };
}

test("native package acceptance selects exactly the two manifest image digests", () => {
  const { manifest, compose } = packageDocuments();
  assert.deepEqual(packageTestImages(manifest, compose), {
    N8N_IMAGE: compose.services.n8n.image,
    INTEGRATION_IMAGE: compose.services.integration.image
  });
});

test("native package acceptance refuses a changed setup contract until its input is updated", () => {
  const { manifest, compose } = packageDocuments();
  manifest.onboarding.actions[0].provisionServiceAccess = false;
  assert.throws(() => packageTestImages(manifest, compose), /Manager service credential/);
  manifest.onboarding.actions[0].provisionServiceAccess = true;
  manifest.onboarding.actions[0].fields.push({ id: "newSecret", required: true });
  assert.throws(() => packageTestImages(manifest, compose), /required setup fields/);
});

test("native package acceptance refuses mutable or mismatched images and duplicate services", () => {
  const mutable = packageDocuments();
  mutable.manifest.images[0].reference = "example.invalid/n8n:latest";
  assert.throws(() => packageTestImages(mutable.manifest, mutable.compose));
  const mismatch = packageDocuments();
  mismatch.compose.services.integration.image = "example.invalid/controller:old";
  assert.throws(() => packageTestImages(mismatch.manifest, mismatch.compose), /images must match/);
  const duplicate = packageDocuments();
  duplicate.manifest.images.push(duplicate.manifest.images[0]);
  assert.throws(() => packageTestImages(duplicate.manifest, duplicate.compose), /Duplicate/);
});
