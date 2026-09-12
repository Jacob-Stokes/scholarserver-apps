import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { readCatalog } from "./catalog.mjs";

const templateIds = ["zotero-weekly-roundup", "zotero-reference-audit", "zotero-bibliography"];
const catalog = await readCatalog(new URL("../templates/", import.meta.url));
const templates = new Map();
for (const id of templateIds) {
  const template = catalog.find((candidate) => candidate.id === id);
  assert.ok(template, `catalog is missing ${id}`);
  templates.set(id, template);
}

function codeFor(id) {
  return templates.get(id).workflow.nodes.find((node) => node.id === "format").parameters.jsCode;
}

function runCode(id, json) {
  const sandbox = {
    $input: {
      first: () => (json === undefined ? undefined : { json })
    }
  };
  return vm.runInNewContext(`(function () {\n${codeFor(id)}\n})()`, sandbox, { timeout: 1000 });
}

function papersPayload(items, date = "2026-08-03") {
  return { items, date, periodEnd: "2026-08-10T00:00:00.000Z" };
}

const completePaper = {
  key: "PAPER123",
  title: "A complete paper",
  authors: ["A Researcher"],
  date: "2026",
  doi: "",
  zoteroUrl: "zotero://select/library/items/PAPER123"
};

test("report templates declare the reviewed native hourly pipeline without retries", () => {
  assert.deepEqual(
    [...templates.values()].map((template) => template.name),
    ["Create a weekly reading roundup", "Check references for missing details", "Create a Markdown bibliography"]
  );
  for (const template of templates.values()) {
    assert.equal(template.presentation.maturity, "preview");
    assert.equal(template.presentation.ai, "none");
    assert.deepEqual(template.requirements[0].actions, ["research-items"]);
    assert.deepEqual(template.requirements[1].actions, ["create-research-note"]);
    assert.ok(template.workflow.nodes.some((node) => node.type === "n8n-nodes-base.manualTrigger"));
    const schedule = template.workflow.nodes.find((node) => node.id === "schedule");
    assert.deepEqual(schedule.parameters.rule.interval, [{ field: "hours", hoursInterval: 24 }]);
    const httpNodes = template.workflow.nodes.filter((node) => node.type === "n8n-nodes-base.httpRequest");
    assert.equal(httpNodes.length, 2);
    assert.equal(httpNodes[0].parameters.url, "http://integration:8081/research/papers");
    assert.equal(httpNodes[1].parameters.url, "http://integration:8081/research/note");
    for (const node of httpNodes) {
      assert.equal(node.retryOnFail, undefined);
      assert.equal(node.maxTries, undefined);
      assert.equal(node.waitBetweenTries, undefined);
    }
    assert.deepEqual(
      template.workflow.connections[httpNodes[0].name].main[0][0].node,
      template.workflow.nodes.find((node) => node.id === "format").name
    );
  }
});

test("empty roundup and bibliography outputs, and issue-free audits, create no note", () => {
  assert.equal(runCode("zotero-weekly-roundup", papersPayload([])).length, 0);
  assert.equal(runCode("zotero-bibliography", papersPayload([])).length, 0);
  assert.equal(runCode("zotero-reference-audit", papersPayload([{ ...completePaper }])).length, 0);
  assert.equal(runCode("zotero-reference-audit", undefined).length, 0);
});

test("reference audit flags only empty title, authors and date, not a missing DOI or the literal Untitled title", () => {
  const result = runCode(
    "zotero-reference-audit",
    papersPayload([
      {
        ...completePaper,
        key: "PAPER124",
        title: " ",
        authors: ["\n"],
        date: "",
        doi: "",
        zoteroUrl: "zotero://select/library/items/PAPER124"
      },
      {
        ...completePaper,
        key: "PAPER125",
        title: "Untitled",
        doi: "",
        zoteroUrl: "zotero://select/library/items/PAPER125"
      }
    ])
  );
  assert.equal(result.length, 1);
  assert.equal(result[0].json.filename, "digest-2026-08-03.md");
  assert.match(result[0].json.content, /missing: title, authors, date/);
  assert.doesNotMatch(result[0].json.content, /PAPER125/);
  assert.equal((result[0].json.content.match(/missing:/g) ?? []).length, 1);
  assert.match(result[0].json.content, /DOI is optional and is not checked/);
});

test("the native-fixture shape produces one audit item for missing authors", () => {
  const result = runCode(
    "zotero-reference-audit",
    papersPayload([
      {
        ...completePaper,
        title: "Synthetic <script> & [brackets]",
        doi: ""
      },
      {
        ...completePaper,
        key: "PAPER124",
        title: "Second synthetic paper",
        authors: [],
        doi: ""
      }
    ])
  );
  assert.equal(result.length, 1);
  assert.equal((result[0].json.content.match(/missing:/g) ?? []).length, 1);
  assert.match(result[0].json.content, /Second synthetic paper.*missing: authors/);
  assert.doesNotMatch(result[0].json.content, /Synthetic.*missing:/);
});

test("roundup and bibliography include deterministic dated metadata without paper summaries", () => {
  const items = [
    { ...completePaper, key: "PAPER124", title: "Second paper", authors: ["B Author"], doi: "10.1000/example" },
    { ...completePaper, title: "First paper", authors: ["A Author"] }
  ];
  for (const id of ["zotero-weekly-roundup", "zotero-bibliography"]) {
    const first = runCode(id, papersPayload(items));
    const second = runCode(id, papersPayload(items));
    assert.equal(JSON.stringify(first), JSON.stringify(second));
    assert.equal(first[0].json.filename, "digest-2026-08-03.md");
    assert.match(first[0].json.content, /2026-08-03/);
    assert.match(first[0].json.content, /2026-08-10T00:00:00\.000Z/);
    assert.doesNotMatch(first[0].json.content, /summary of|key points|abstract/i);
  }
  const bibliography = runCode("zotero-bibliography", papersPayload(items))[0].json.content;
  assert.match(bibliography, /Plain Markdown metadata/);
  assert.match(bibliography, /not a CSL, APA or other style-formatted bibliography/);
});

test("untrusted metadata is flattened and Markdown-escaped, while invalid URLs remain plain text", () => {
  const hostilePaper = {
    key: "PAPER124",
    title: "  [click](javascript:bad) | line\nnext *emphasis*  ",
    authors: ["Author | One", "Second\nAuthor"],
    date: "2026 | date\nnext",
    doi: "10.1000/a|b\nnext",
    zoteroUrl: "javascript:alert(1)"
  };
  for (const id of ["zotero-weekly-roundup", "zotero-bibliography"]) {
    const content = runCode(id, papersPayload([hostilePaper]))[0].json.content;
    assert.ok(content.includes("\\[click\\]\\(javascript:bad\\)"));
    assert.ok(content.includes("Author \\| One, Second Author"));
    assert.ok(content.includes("2026 \\| date next"));
    assert.ok(content.includes("10.1000/a\\|b next"));
    assert.doesNotMatch(content, /\]\(javascript:alert/);
  }
});

test("malformed envelopes and malformed item entries fail closed without an invalid dated identity", () => {
  for (const id of templateIds) {
    assert.equal(runCode(id, { items: [null, "not an item", 42], date: "bad", periodEnd: "bad" }).length, 0);
    assert.equal(
      runCode(id, { items: [null, "not an item", 42], date: "2026-08-03", periodEnd: "2026-08-10T00:00:00.000Z" })
        .length,
      0
    );
  }
});
