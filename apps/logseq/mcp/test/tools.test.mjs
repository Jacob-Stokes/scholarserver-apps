import assert from "node:assert/strict";
import test from "node:test";
import { graphTools } from "../dist/tools.js";

test("research tools stay narrow and identify non-idempotent writes", async () => {
  const calls = [];
  const tools = graphTools(async (operation, input) => {
    calls.push({ operation, input });
    return { result: [12] };
  });
  assert.equal(tools.length, 14);
  assert.ok(!tools.some((tool) => /exec|shell|query|delete/.test(tool.def.name)));
  const append = tools.find((tool) => tool.def.name === "append_block");
  assert.equal(append.def.annotations.idempotentHint, false);
  assert.match(append.def.description, /timeout/);
  const value = append.def.inputSchema.parse({ page: "Reading", content: "DOI: 10.1000/example" });
  await append.handler(value);
  assert.deepEqual(calls, [{ operation: "append-block", input: value }]);
  assert.throws(() => append.def.inputSchema.parse({ page: "Reading", content: "x", command: "shell" }));
});

test("all new tools validate input and forward only their named operation", async () => {
  const calls = [];
  const tools = graphTools(async (operation, input) => calls.push({ operation, input }));
  const examples = [
    ["list_pages", "list-pages", { limit: 10, offset: 20 }],
    ["search_blocks", "search-blocks", { query: "Citation" }],
    ["read_block", "read-block", { id: 123 }],
    ["update_block", "update-block", { id: 123, content: "Edited citation" }],
    ["append_child_block", "append-child-block", { id: 123, content: "Methods" }],
    ["list_tasks", "list-tasks", {}],
    ["list_task_statuses", "list-task-statuses", {}],
    ["set_task_status", "set-task-status", { id: 124, status: "logseq.property/status.done" }]
  ];
  for (const [name, operation, input] of examples) {
    const tool = tools.find((tool) => tool.def.name === name);
    await tool.handler(tool.def.inputSchema.parse(input));
    assert.deepEqual(calls.at(-1), { operation, input });
    assert.throws(() => tool.def.inputSchema.parse({ ...input, graph: "Other" }));
  }
  const edit = tools.find((tool) => tool.def.name === "update_block");
  assert.equal(edit.def.annotations.destructiveHint, true);
  assert.equal(edit.def.annotations.idempotentHint, true);
  const nested = tools.find((tool) => tool.def.name === "append_child_block");
  assert.equal(nested.def.annotations.idempotentHint, false);
  assert.throws(() => edit.def.inputSchema.parse({ id: -1, content: "Note" }));
});
