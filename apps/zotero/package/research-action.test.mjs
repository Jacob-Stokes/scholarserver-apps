import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { parse } from "yaml";

test("the research candidate declares one bounded runtime research action without a new caller grant", async () => {
  const manifest = parse(await readFile(new URL("./scholarserver-app.yaml", import.meta.url), "utf8"));
  const compose = parse(await readFile(new URL("./compose.yaml", import.meta.url), "utf8"));
  assert.equal(manifest.packageVersion, "0.5.10-guided.20260918.1");
  assert.deepEqual(
    manifest.onboarding.actions.filter((action) => action.id === "research-items"),
    [
      {
        id: "research-items",
        data: "runtime",
        timeoutSeconds: 120,
        fields: [
          { id: "since", type: "string", secret: false, required: true },
          { id: "until", type: "string", secret: false, required: true }
        ]
      }
    ]
  );
  for (const variant of manifest.variants) {
    assert.ok(variant.services.includes("controller"));
    assert.ok(variant.data.includes("runtime"));
  }
  for (const image of manifest.images) assert.equal(compose.services[image.service].image, image.reference);
  assert.equal(manifest.permissions.applicationActions, undefined);
});
