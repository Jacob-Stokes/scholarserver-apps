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

test("native restart assertion requires the current status contract without accepting extra fields", async () => {
  const harness = readFileSync(new URL("../test-container.sh", import.meta.url), "utf8");
  const assertion = harness.match(
    /^  assert\.deepEqual\(await \(await fetch\("http:\/\/localhost:8080\/api\/status"\)\)\.json\(\),.*\);$/m
  )?.[0];
  assert.ok(assertion, "the native restart gate must keep a strict status assertion");
  // Execute the actual shell-embedded assertion with a synthetic HTTP response.
  const checkStatus = new Function("assert", "fetch", `return (async () => { ${assertion} })();`);
  const ready = { connected: true, phase: "ready", automationInterfaceVersion: 1 };
  const check = (status) => checkStatus(assert, async () => ({ json: async () => status }));
  await check(ready);
  for (const status of [
    { connected: true, phase: "ready" },
    { ...ready, connected: false },
    { ...ready, phase: "password-required" },
    { ...ready, automationInterfaceVersion: 2 },
    { ...ready, apiKey: "synthetic-unexpected-secret" }
  ]) {
    await assert.rejects(() => check(status), { code: "ERR_ASSERTION" });
  }
});

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

test("package refuses multiple service-access provisioning actions", () => {
  const { manifest, compose } = packageDocuments();
  manifest.onboarding.actions.push({ id: "second", provisionServiceAccess: true, fields: [] });
  assert.throws(() => packageTestImages(manifest, compose), /Only one action/);
});
