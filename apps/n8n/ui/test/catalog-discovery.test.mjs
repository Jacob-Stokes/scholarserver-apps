import assert from "node:assert/strict";
import test from "node:test";
import { readCatalog } from "../../integration/catalog.mjs";
import { emptyCatalogFilters, filterTemplates, requiredAppAccess } from "../src/catalog-discovery.ts";

const templates = (await readCatalog(new URL("../../templates/", import.meta.url))).filter(
  (template) => template.research
);
const reading = templates.find((template) => template.id === "zotero-reading-notes");
const applications = reading.requirements.map((requirement) => ({
  id: requirement.binding,
  workspaceId: "personal",
  packageId: requirement.packageId,
  actions: requirement.actions
}));

test("search combines words across outcome, application, role and tags without changing catalog order", () => {
  const order = templates.map((template) => template.id);
  const matches = filterTemplates(templates, { ...emptyCatalogFilters, query: "  OBSIDIAN reading-note  " });
  assert.deepEqual(
    matches.map((template) => template.id),
    [reading.id]
  );
  assert.deepEqual(
    templates.map((template) => template.id),
    order
  );
  assert.equal(filterTemplates(templates, { ...emptyCatalogFilters, query: "unknown workflow" }).length, 0);
});

test("app and query intersect with any selected tag, and missing old metadata stays searchable", () => {
  const filters = { ...emptyCatalogFilters, application: "org.scholarserver.docling", tags: ["Reading", "PDFs"] };
  assert.deepEqual(
    filterTemplates(templates, filters).map((template) => template.id),
    ["zotero-pdf-markdown"]
  );
  assert.equal(filterTemplates(templates, { ...filters, query: "note starters" }).length, 0);
  const legacy = { ...reading, presentation: null };
  assert.equal(filterTemplates([legacy], { ...emptyCatalogFilters, query: "reading" }).length, 1);
  assert.equal(filterTemplates([legacy], { ...emptyCatalogFilters, tags: ["Reading"] }).length, 0);
});

test("both explicit name sorts have stable identity ties and do not mutate caller arrays", () => {
  const duplicates = [
    { ...reading, id: "b" },
    { ...reading, id: "a" }
  ];
  assert.deepEqual(
    filterTemplates(duplicates, emptyCatalogFilters).map((template) => template.id),
    ["a", "b"]
  );
  assert.deepEqual(
    filterTemplates(duplicates, { ...emptyCatalogFilters, sort: "name-desc" }).map((template) => template.id),
    ["b", "a"]
  );
  assert.deepEqual(
    duplicates.map((template) => template.id),
    ["b", "a"]
  );
});

test("available actions require the same workspace; missing and unknown access are never labelled ready", () => {
  assert.equal(requiredAppAccess(reading, applications).available, true);
  assert.equal(requiredAppAccess(reading, null).available, false);
  assert.equal(requiredAppAccess(reading, []).available, false);
  assert.equal(
    requiredAppAccess(
      reading,
      applications.map((app, index) => ({ ...app, workspaceId: String(index) }))
    ).available,
    false
  );
  assert.equal(
    requiredAppAccess(
      reading,
      applications.map((app) => ({ ...app, actions: [] }))
    ).available,
    false
  );
});
