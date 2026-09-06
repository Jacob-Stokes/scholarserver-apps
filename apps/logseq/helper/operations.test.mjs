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

test("browsing, editing and tasks map to fixed official commands", () => {
  assert.deepEqual(graphCommand("list-pages"), ["list", "page", "--limit=50", "--offset=0"]);
  assert.deepEqual(graphCommand("list-tasks", { limit: 2, offset: 5 }), ["list", "task", "--limit=2", "--offset=5"]);
  assert.deepEqual(graphCommand("search-blocks", { query: "--help" }), ["search", "block", "--content=--help"]);
  assert.deepEqual(graphCommand("read-block", { id: 123 }), ["show", "--id=123", "--level", "8"]);
  assert.deepEqual(graphCommand("update-block", { id: 123, content: "αβγ --help" }), [
    "upsert",
    "block",
    "--id=123",
    "--content=αβγ --help"
  ]);
  assert.deepEqual(graphCommand("append-child-block", { id: 123, content: "Child" }), [
    "upsert",
    "block",
    "--target-id=123",
    "--content=Child",
    "--pos",
    "last-child"
  ]);
  assert.deepEqual(graphCommand("list-task-statuses"), ["query", "--name=list-status"]);
  assert.deepEqual(graphCommand("set-task-status", { id: 123, status: "logseq.property/status.done" }), [
    "upsert",
    "task",
    "--id=123",
    "--status=logseq.property/status.done"
  ]);
});

test("new operations reject extra authority and malformed selectors", () => {
  for (const id of [0, -1, 1.5, "123", "--help", Number.MAX_SAFE_INTEGER + 1, null]) {
    assert.throws(() => graphCommand("read-block", { id }), /Provide id/);
  }
  for (const limit of [0, 101, 2.5, "10"]) {
    assert.throws(() => graphCommand("list-pages", { limit }), /Provide limit/);
  }
  assert.throws(() => graphCommand("list-tasks", { offset: -1 }), /Provide offset/);
  assert.throws(() => graphCommand("list-task-statuses", { query: "arbitrary" }), /Unexpected field/);
  assert.throws(() => graphCommand("update-block", { id: 1, content: "note", graph: "Other" }), /Unexpected field/);
  assert.throws(() => graphCommand("set-task-status", { id: 1, status: "" }), /Provide status/);
});
