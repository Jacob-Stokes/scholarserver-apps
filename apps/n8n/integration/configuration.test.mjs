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
    { hoursInterval: 169 },
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
  assert.throws(() => configureWorkflow(invalid, workflowFromTemplate(invalid)), /native minute or hour schedule/);
});

test("PDF watcher uses native minute polling and rejects ambiguous or invalid settings", async () => {
  const pdf = readTemplate(await readFile(new URL("../templates/zotero-pdf-markdown.yaml", import.meta.url), "utf8"));
  assert.deepEqual(scheduleConfiguration(pdf), { minutesInterval: 1, minimum: 1, maximum: 60 });
  const workflow = configureWorkflow(pdf, workflowFromTemplate(pdf), { minutesInterval: 2 });
  assert.equal(workflowScheduleMinutes(pdf, workflow), 2);
  assert.equal(workflowScheduleHours(pdf, workflow), null);
  assert.equal(pdf.workflow.nodes[1].parameters.rule.interval[0].minutesInterval, 1);
  assert.deepEqual(workflow.connections, pdf.workflow.connections);
  for (const value of [0, 61, 1.5, null, "1", "={{ $env.SECRET }}"]) {
    assert.throws(() => configureWorkflow(pdf, workflowFromTemplate(pdf), { minutesInterval: value }));
  }
  assert.throws(() => configureWorkflow(pdf, workflowFromTemplate(pdf), { hoursInterval: 1 }));
  assert.throws(() => configureWorkflow(template, workflowFromTemplate(template), { minutesInterval: 1 }));
  // Previously installed hourly graphs retain their actual cadence in inventory.
  workflow.nodes[1].parameters.rule.interval = [{ field: "hours", hoursInterval: 6 }];
  assert.equal(workflowScheduleHours(pdf, workflow), 6);
  assert.equal(workflowScheduleMinutes(pdf, workflow), null);
});
