import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("the integration image ships the Manager connection module used by setup and research", async () => {
  const recipe = await readFile(new URL("./Dockerfile", import.meta.url), "utf8");
  assert.match(recipe, /COPY apps\/n8n\/integration\/manager-connection\.mjs \.\//);
  assert.match(recipe, /COPY apps\/n8n\/integration\/automation-contract\.mjs \.\//);
  assert.match(recipe, /COPY apps\/n8n\/integration\/native-setup-form\.mjs \.\//);
});

test("the native setup form participates in the integration image source fingerprint", async () => {
  const inventory = JSON.parse(
    await readFile(new URL("../../../scripts/image-source-inventory.json", import.meta.url))
  );
  const recipe = inventory.recipes.find((candidate) => candidate.name === "n8n-app");
  assert.ok(recipe.sourceInputs.includes("apps/n8n/integration/native-setup-form.mjs"));
});
