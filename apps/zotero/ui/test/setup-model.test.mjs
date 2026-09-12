import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

// Compile the pure model with the workspace's existing TypeScript compiler.
// This keeps the tests independent of React, a browser and Node's TS support.
const source = await readFile(new URL("../src/setup-model.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext }
});
const model = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);

function option(id, recommended = false, authentication = {}) {
  return {
    id,
    recommended,
    authentication: { authentik: "optional", available: true, defaultEnabled: false, ...authentication }
  };
}

test("saved setup state resumes at its corresponding step; unknown states begin with account", () => {
  const cases = [
    ["ready", "ready"],
    ["authorization-required", "authorization"],
    ["desktop-access-required", "access"],
    ["storage-required", "storage"],
    ["account-required", "account"],
    ["setup-required", "account"],
    ["unavailable", "account"]
  ];
  for (const [state, expected] of cases) assert.equal(model.initialSetupStage(state), expected, state);
});

test("loading desktop access only advances or repairs the access boundary", () => {
  for (const stage of ["account", "storage", "access", "authorization", "ready"]) {
    const missingAddress = stage === "authorization" || stage === "ready";
    assert.equal(model.stageAfterAccessLoad(stage, false), missingAddress ? "access" : stage);
    assert.equal(model.stageAfterAccessLoad(stage, true), stage === "access" ? "authorization" : stage);
  }
});

test("saved desktop choice wins, then the editable choice, recommendation, and first option", () => {
  const options = [option("first"), option("recommended", true), option("saved"), option("draft")];
  assert.equal(model.selectedDesktopOptionId(options, "saved", "draft"), "saved");
  assert.equal(model.selectedDesktopOptionId(options, "removed", "draft"), "draft");
  assert.equal(model.selectedDesktopOptionId(options, "removed", "removed"), "recommended");
  assert.equal(model.selectedDesktopOptionId([option("first")], undefined, ""), "first");
  assert.equal(model.selectedDesktopOptionId([], "saved", "draft"), "");
});

test("desktop sign-in defaults require both support and availability", () => {
  for (const authentik of ["optional", "required", "unsupported"]) {
    for (const available of [false, true]) {
      for (const defaultEnabled of [false, true]) {
        const access = option("private", false, { authentik, available, defaultEnabled });
        const enabled = authentik !== "unsupported" && available && defaultEnabled;
        assert.equal(model.defaultDesktopAuthentication(access), enabled ? "authentik" : "none");
      }
    }
  }
});

test("only same-origin desktops can be embedded; other protected addresses use a new tab", () => {
  const origin = "https://scholar.example";
  assert.equal(model.canEmbedDesktop("/apps/zotero/desktop", origin), true);
  assert.equal(model.canEmbedDesktop("https://zotero.example/", origin), false);
  assert.equal(model.canEmbedDesktop("http://scholar.example/", origin), false);
  assert.equal(model.canEmbedDesktop("https://user:pass@scholar.example/", origin), false);
  assert.equal(model.canEmbedDesktop("javascript:alert(1)", origin), false);
});

test("account links reject non-Zotero origins and credentials in URLs", () => {
  assert.equal(
    model.approvedLoginUrl("https://www.zotero.org/login?session=test"),
    "https://www.zotero.org/login?session=test"
  );
  assert.equal(
    model.approvedLoginUrl("https://www.zotero.org/login/session?session=test"),
    "https://www.zotero.org/login/session?session=test"
  );
  for (const url of [
    "https://evil.test/login/session",
    "http://www.zotero.org/login/session",
    "https://www.zotero.org.evil.test/login/session",
    "https://user:pass@www.zotero.org/login/session"
  ]) {
    assert.throws(() => model.approvedLoginUrl(url));
  }
});
