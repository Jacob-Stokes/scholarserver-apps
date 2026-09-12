import assert from "node:assert/strict";
import test from "node:test";
import { scheduleConfiguration } from "./configuration.mjs";
import { researchConfiguration } from "./research-access.mjs";
import { ResearchBridge, researchWindow } from "./research-bridge.mjs";

const folders = {
  "weekly-roundup": "Weekly roundups",
  "reference-audit": "Reference checks",
  bibliography: "Bibliographies"
};
const bindings = { workspaceId: "personal", zotero: "library", obsidian: "vault", folder: "Research" };

test("weekly reports read the previous complete UTC week across Sunday, Monday and year boundaries", () => {
  for (const [now, since, until] of [
    ["2026-09-13T23:59:59Z", "2026-08-31", "2026-09-07"],
    ["2026-09-14T00:00:00Z", "2026-09-07", "2026-09-14"],
    ["2027-01-01T12:00:00Z", "2026-12-21", "2026-12-28"]
  ]) {
    assert.deepEqual(researchWindow("weekly-roundup", new Date(now)), {
      since: `${since}T00:00:00.000Z`,
      until: `${until}T00:00:00.000Z`
    });
  }
});

test("daily reports use the previous UTC day, including leap day, and existing reading windows stay unchanged", () => {
  for (const kind of ["reference-audit", "bibliography", "research-digest"]) {
    assert.deepEqual(researchWindow(kind, new Date("2028-03-01T19:30:00+02:00")), {
      since: "2028-02-29T00:00:00.000Z",
      until: "2028-03-01T00:00:00.000Z"
    });
  }
  assert.deepEqual(researchWindow("reading-notes", new Date("2026-09-12T12:34:56Z")), {
    since: "2026-09-05T12:34:56.000Z",
    until: "2026-09-12T12:34:56.000Z"
  });
  assert.throws(() => researchWindow("convert-pdfs", new Date()));
  assert.throws(() => researchWindow("bibliography", new Date("invalid")));
});

test("report writes narrow the selected folder and cannot choose another report path or app action", async () => {
  const bridge = new ResearchBridge({ now: () => new Date("2026-09-12T10:00:00Z") });
  bridge.validateScope = async () => {};
  const calls = [];
  bridge.action = async (scope, app, action, input) => {
    calls.push({ scope, app, action, input });
    return action === "research-items" ? { items: [] } : { state: "created" };
  };
  for (const [kind, folder] of Object.entries(folders)) {
    const scope = researchConfiguration({ research: kind }, { research: bindings });
    const papers = await bridge.execute(scope, "papers", { since: "1900-01-01", until: "2100-01-01" });
    assert.equal(calls.at(-1).action, "research-items");
    assert.notEqual(calls.at(-1).input.since, "1900-01-01");
    assert.match(papers.date, /^2026-/);
    await bridge.execute(scope, "note", { filename: `digest-${papers.date}.md`, content: "Test", folder: "Elsewhere" });
    assert.deepEqual(calls.at(-1), {
      scope,
      app: "obsidian",
      action: "create-research-note",
      input: { folder: `Research/${folder}`, filename: `digest-${papers.date}.md`, content: "Test" }
    });
    for (const filename of [
      "../digest-2026-09-11.md",
      "other.md",
      "zotero-ABCD1234.md",
      "Bibliographies/digest-2026-09-11.md"
    ]) {
      await assert.rejects(bridge.execute(scope, "note", { filename, content: "Test" }), /Invalid note identity/);
    }
    await assert.rejects(bridge.execute(scope, "enqueue", {}), /not allowed/);
    assert.throws(
      () =>
        researchConfiguration(
          { research: kind },
          {
            research: { ...bindings, folder: "a".repeat(200) }
          }
        ),
      /shorter folder/
    );
  }
});

test("daily report schedules cannot skip days; the weekly report permits at most one week", () => {
  for (const [kind, maximum] of [
    ["reference-audit", 24],
    ["bibliography", 24],
    ["weekly-roundup", 168]
  ]) {
    const template = {
      research: kind,
      configuration: { scheduleNode: "schedule" },
      workflow: {
        nodes: [
          {
            id: "schedule",
            type: "n8n-nodes-base.scheduleTrigger",
            parameters: { rule: { interval: [{ field: "hours", hoursInterval: maximum }] } }
          }
        ]
      }
    };
    assert.equal(scheduleConfiguration(template).maximum, maximum);
    template.workflow.nodes[0].parameters.rule.interval[0].hoursInterval++;
    assert.throws(() => scheduleConfiguration(template), /whole number/);
  }
});
