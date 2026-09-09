import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { configureWorkflow, workflowScheduleHours } from "./configuration.mjs";
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
  assert.throws(() => configureWorkflow(invalid, workflowFromTemplate(invalid)), /native hourly schedule/);
});
