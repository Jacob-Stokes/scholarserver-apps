import assert from "node:assert/strict";
import test from "node:test";
import { graphTools } from "../dist/tools.js";

test("research tools stay narrow and identify non-idempotent writes", async () => {
  const calls = [];
  const tools = graphTools(async (operation, input) => {
    calls.push({ operation, input });
    return { result: [12] };
  });
  assert.equal(tools.length, 6);
  assert.ok(!tools.some((tool) => /exec|shell|query|delete/.test(tool.def.name)));
  const append = tools.find((tool) => tool.def.name === "append_block");
  assert.equal(append.def.annotations.idempotentHint, false);
  assert.match(append.def.description, /timeout/);
  const value = append.def.inputSchema.parse({ page: "Reading", content: "DOI: 10.1000/example" });
  await append.handler(value);
  assert.deepEqual(calls, [{ operation: "append-block", input: value }]);
  assert.throws(() => append.def.inputSchema.parse({ page: "Reading", content: "x", command: "shell" }));
});
