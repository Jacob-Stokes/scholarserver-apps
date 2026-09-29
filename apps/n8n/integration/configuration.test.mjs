import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  configureWorkflow,
  scheduleConfiguration,
  workflowScheduleHours,
  workflowScheduleMinutes
} from "./configuration.mjs";
import { readTemplate, workflowFromTemplate } from "./templates.mjs";

const template = readTemplate(await readFile(new URL("../templates/connection-check.yaml", import.meta.url), "utf8"));
test("schedule configuration changes only the native interval and leaves the template unchanged", () => {
  const workflow = configureWorkflow(template, workflowFromTemplate(template), { hoursInterval: 12 });
  assert.equal(workflow.nodes[1].parameters.rule.interval[0].hoursInterval, 12);
  assert.equal(template.workflow.nodes[1].parameters.rule.interval[0].hoursInterval, 1);
  assert.deepEqual(workflow.connections, template.workflow.connections);
  assert.equal(workflow.active, undefined);
  assert.equal(workflowScheduleHours(template, workflow), 12);
  workflow.nodes[1].parameters.rule.interval = [{ field: "days", daysInterval: 1 }];
  assert.equal(workflowScheduleHours(template, workflow), null);
});
test("schedule configuration rejects unknown settings, expressions and invalid intervals", () => {
  for (const settings of [
    { hoursInterval: 0 },
    { hoursInterval: 24 },
    { hoursInterval: 1.5 },
    { hoursInterval: null },
    { hoursInterval: "={{ $env.SECRET }}" },
    { apiKey: "secret" },
    [],
    null
  ]) {
    assert.throws(() => configureWorkflow(template, workflowFromTemplate(template), settings));
  }
});
test("template configuration cannot target arbitrary nodes or parameter paths", () => {
  const invalid = structuredClone(template);
  invalid.configuration.scheduleNode = "test-result";
  assert.throws(() => configureWorkflow(invalid, workflowFromTemplate(invalid)), /native minute, hour or day schedule/);
});

test("PDF watcher defaults to a supported native hourly schedule and rejects invalid settings", async () => {
  const pdf = readTemplate(await readFile(new URL("../templates/zotero-pdf-markdown.yaml", import.meta.url), "utf8"));
  assert.deepEqual(scheduleConfiguration(pdf), { hoursInterval: 1, minimum: 1, maximum: 23 });
  const workflow = configureWorkflow(pdf, workflowFromTemplate(pdf), { hoursInterval: 2 });
  assert.equal(workflowScheduleHours(pdf, workflow), 2);
  assert.equal(workflowScheduleMinutes(pdf, workflow), null);
  const templateSchedule = pdf.workflow.nodes.find((node) => node.id === pdf.configuration.scheduleNode);
  assert.equal(templateSchedule.parameters.rule.interval[0].hoursInterval, 1);
  assert.deepEqual(workflow.connections, pdf.workflow.connections);
  for (const value of [0, 24, 1.5, null, "1", "={{ $env.SECRET }}"]) {
    assert.throws(() => configureWorkflow(pdf, workflowFromTemplate(pdf), { hoursInterval: value }));
  }
  assert.throws(() => configureWorkflow(pdf, workflowFromTemplate(pdf), { minutesInterval: 1 }));
  assert.throws(() => configureWorkflow(template, workflowFromTemplate(template), { minutesInterval: 1 }));
  // Previously installed minute graphs retain their actual cadence in inventory.
  const installedSchedule = workflow.nodes.find((node) => node.id === pdf.configuration.scheduleNode);
  installedSchedule.parameters.rule.interval = [{ field: "minutes", minutesInterval: 30 }];
  assert.equal(workflowScheduleHours(pdf, workflow), null);
  assert.equal(workflowScheduleMinutes(pdf, workflow), 30);
});
