import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { parse } from "yaml";
import { readCatalog } from "./catalog.mjs";
import { assertRequiredApplications, validateRequirements } from "./requirements.mjs";

const templates = await readCatalog(new URL("../templates/", import.meta.url));
const manifest = parse(await readFile(new URL("../package/scholarserver-app.yaml", import.meta.url), "utf8"));

test("research catalog tags are bounded, nonempty and case-insensitively unique", () => {
  const template = templates.find((candidate) => candidate.research);
  for (const tags of [
    undefined,
    [],
    ["Notes", "notes"],
    [" bad"],
    ["<script>"],
    ["a".repeat(33)],
    new Array(9).fill("Notes")
  ]) {
    const broken = structuredClone(template);
    broken.presentation.tags = tags;
    assert.throws(() => validateRequirements(broken), /catalog tags/);
  }
});

test("reviewed role actions match the implemented bridge and stay within package grants", () => {
  for (const template of templates.filter((candidate) => candidate.research)) {
    const expected =
      template.research === "convert-pdfs"
        ? { zotero: ["match-attachment", "attach-docling-result"], docling: ["discover", "enqueue", "job-status"] }
        : { zotero: ["research-items"], obsidian: ["create-research-note"] };
    for (const requirement of template.requirements) {
      assert.deepEqual(requirement.actions, expected[requirement.binding]);
      const grant = manifest.permissions.applicationActions.find((value) => value.packageId === requirement.packageId);
      assert.ok(grant);
      assert.ok(requirement.actions.every((action) => grant.actionIds.includes(action)));
    }
    const broken = structuredClone(template);
    broken.requirements[1].binding = "zotero";
    assert.throws(() => validateRequirements(broken));
  }
});

test("all required actions and exact workspace bindings are checked, not one representative action", () => {
  const template = templates.find((candidate) => candidate.research === "convert-pdfs");
  const scope = { workspaceId: "personal", zotero: "library", docling: "converter" };
  const applications = template.requirements.map((requirement) => ({
    id: scope[requirement.binding],
    workspaceId: "personal",
    packageId: requirement.packageId,
    actions: requirement.actions
  }));
  assert.doesNotThrow(() => assertRequiredApplications(template.requirements, scope, applications));
  const incomplete = structuredClone(applications);
  incomplete[1].actions = ["discover"];
  assert.throws(() => assertRequiredApplications(template.requirements, scope, incomplete));
  assert.throws(() =>
    assertRequiredApplications(template.requirements, { ...scope, workspaceId: "other" }, applications)
  );
});
