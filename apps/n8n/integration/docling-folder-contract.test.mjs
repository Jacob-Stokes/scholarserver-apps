import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parse } from "yaml";

test("Docling folder browsing uses the controller request directory, not research documents", () => {
  const manifest = parse(
    readFileSync(new URL("../../docling/package/scholarserver-app.yaml", import.meta.url), "utf8")
  );
  const action = manifest.onboarding.actions.find((item) => item.id === "browse-folders");
  assert.equal(action.data, "runtime");
});
