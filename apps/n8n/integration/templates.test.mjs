import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { assertWorkflowUnchanged, readTemplate, workflowFingerprint, workflowFromTemplate } from "./templates.mjs";

const source = await readFile(new URL("../templates/connection-check.yaml", import.meta.url), "utf8");

test("YAML produces a native n8n workflow without implicitly enabling it", () => {
  const template = readTemplate(source);
  const workflow = workflowFromTemplate(template);
  assert.equal(workflow.nodes.length, 3);
  assert.equal(workflow.active, undefined);
  workflow.nodes[0].name = "Changed";
  assert.equal(template.workflow.nodes[0].name, "Run test");
});

test("duplicate YAML keys, node names, and dangling connections are rejected", () => {
  assert.throws(() => readTemplate(`${source}\nid: duplicate\n`), /Invalid/);
  assert.throws(() => readTemplate(source.replace("name: Record test result", "name: Every hour")), /unique/);
  assert.throws(() => readTemplate(source.replace("node: Record test result", "node: Missing")), /unknown target/);
});

test("template cannot contain a preconnected credential", () => {
  assert.throws(
    () => readTemplate(source.replace("name: Every hour", "credentials: {}\n      name: Every hour")),
    /credentials/
  );
});

test("fingerprints ignore response metadata but detect direct n8n edits", () => {
  const workflow = workflowFromTemplate(readTemplate(source));
  const fingerprint = workflowFingerprint(workflow);
  assertWorkflowUnchanged({ ...workflow, id: "123", updatedAt: "later", active: true }, fingerprint);
  workflow.nodes[2].parameters.assignments.assignments[0].value = "User edit";
  assert.throws(() => assertWorkflowUnchanged(workflow, fingerprint), /changed in n8n/);
});
