import assert from "node:assert/strict";
import test from "node:test";
import { graphCommand, validateGraphName } from "./operations.mjs";

test("research operations use upstream graph APIs, not SQLite or shell commands", () => {
  assert.deepEqual(graphCommand("search-pages", { query: "Darwin" }), ["search", "page", "--content=Darwin"]);
  assert.deepEqual(graphCommand("create-page", { page: "Reading" }), ["upsert", "page", "--page=Reading"]);
  assert.deepEqual(graphCommand("create-page", { page: "--help" }), ["upsert", "page", "--page=--help"]);
  assert.equal(
    graphCommand("append-block", { page: "Reading", content: "Citation: https://doi.org/10.1000/example" })[1],
    "block"
  );
  assert.equal(graphCommand("create-task", { page: "Reading", content: "Check the methods" })[1], "task");
  assert.throws(() => graphCommand("exec", { command: "rm" }), /not available/);
  assert.throws(() => graphCommand("status", { graph: "another graph" }), /Unexpected field/);
  assert.throws(() => graphCommand("read-page", { page: "" }), /Provide page/);
  assert.throws(
    () => graphCommand("append-block", { page: "Reading", content: "x".repeat(32_001) }),
    /Provide content/
  );
  assert.throws(() => graphCommand("status", []), /operation object/);
});

test("graph identity cannot escape its persistent directory", () => {
  for (const invalid of ["../notes", "/notes", "a/b", ".", "", "-flag", "a\0b"]) {
    assert.throws(() => validateGraphName(invalid));
  }
  assert.equal(validateGraphName("Research 2026"), "Research 2026");
});
