import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const apps = ["obsidian", "logseq", "freshrss", "zotero", "docling", "n8n"];
const routes = new Map();
for (const app of apps) {
  const source = await readFile(new URL(`../apps/${app}/ui/src/manager-navigation.ts`, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext }
  });
  const module = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);
  routes.set(app, module.managerDestination);
}

for (const app of apps) {
  test(`${app} sends bookmarked configuration to the same installed instance in Manager`, () => {
    const destination = routes.get(app);
    assert.equal(destination("/apps/second-copy/configuration"), "/applications/manage/second-copy/configuration");
    assert.equal(destination("/apps/second-copy/configuration/"), "/applications/manage/second-copy/configuration");
    assert.equal(
      destination("/apps/second-copy/configuration", "?managerSetup=1"),
      "/applications/manage/second-copy/configuration"
    );
    assert.equal(destination("/configuration"), null);
    assert.equal(destination("/applications/manage/second-copy/configuration"), null);
    assert.equal(destination("/apps/../configuration"), null);
    assert.equal(destination("/apps/second-copy/api/status"), null);
  });
}

for (const app of ["obsidian", "logseq", "freshrss", "zotero"]) {
  test(`${app} returns obsolete overview entry points to Manage`, () => {
    for (const suffix of ["", "/", "/overview", "/overview/"]) {
      assert.equal(routes.get(app)(`/apps/second-copy${suffix}`), "/applications/manage/second-copy");
    }
  });
}

test("document and attachment workspaces keep their app-owned routes", () => {
  for (const suffix of ["", "/queue", "/process"])
    assert.equal(routes.get("docling")(`/apps/documents${suffix}`), null);
  assert.equal(routes.get("zotero")("/apps/references/attachments"), null);
  for (const suffix of ["/automations", "/automations/convert-zotero-pdfs"])
    assert.equal(
      routes.get("zotero")(`/apps/references${suffix}`),
      "/applications/manage/references/configuration#configuration-automation"
    );
});

test("n8n keeps only the explicit embedded setup route and carries engine identity into Manager", () => {
  const destination = routes.get("n8n");
  assert.equal(destination("/apps/engine-two/automation-setup", "?managerSetup=1&templateId=test"), null);
  assert.equal(destination("/apps/engine-two/automation-setup", "?managerSetup=0"), "/automations?engine=engine-two");
  for (const suffix of ["", "/", "/overview", "/automations"]) {
    assert.equal(destination(`/apps/engine-two${suffix}`), "/automations?engine=engine-two");
  }
  assert.equal(destination("/apps/engine-two/catalog"), "/automations/catalog?engine=engine-two");
});
