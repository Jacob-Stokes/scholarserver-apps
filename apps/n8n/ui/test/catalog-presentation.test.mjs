import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../src/AutomationCatalog.tsx", import.meta.url), "utf8");

test("embedded catalog uses a borderless selected form and leaves the template title to Manager", () => {
  assert.match(source, /embedded\s*=\s*false/);
  assert.match(source, /automation-setup-form-embedded ss-stack/);
  assert.match(source, /!embedded \? <h2>\{selected\.template\.name\}<\/h2> : null/);
  assert.match(
    source,
    /embedded \? "automation-setup-form automation-setup-form-embedded ss-stack" : "ss-card ss-stack"/
  );
});
