import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  assertConfigurationActionRequest,
  ConfigurationActionError,
  ConfigurationActions
} from "./configuration-actions.mjs";

test("configuration actions serialize, reject stale revisions, and observe duplicates", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "configuration-actions-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const actions = new ConfigurationActions(directory, "settings");
  let revision = "first";
  let writes = 0;
  const section = () => ({
    id: "settings",
    revision,
    fields: [],
    actions: [{ id: "save", kind: "submit", fieldIds: [], target: { kind: "app" } }]
  });
  const apply = async () => {
    writes += 1;
    revision = "second";
  };
  const request = assertConfigurationActionRequest(
    { requestId: "request-12345678", expectedRevision: "first", values: {} },
    "save",
    "settings"
  );
  const [first, duplicate] = await Promise.all([
    actions.run(request, section, apply),
    actions.run(request, section, apply)
  ]);
  assert.deepEqual(first, duplicate);
  assert.equal(first.status, "succeeded");
  assert.deepEqual(Object.keys(first).sort(), ["actionId", "requestId", "status"]);
  assert.equal(writes, 1);
  await assert.rejects(
    actions.run({ ...request, requestId: "request-87654321" }, section, apply),
    (error) => error instanceof ConfigurationActionError && error.status === 409
  );
  assert.equal(writes, 1);
});

test("interrupted actions retain an unconfirmed receipt without input secrets or replay", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "configuration-actions-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const actions = new ConfigurationActions(directory, "settings");
  const request = assertConfigurationActionRequest(
    { requestId: "request-12345678", expectedRevision: "first", values: { password: "sensitive" } },
    "save",
    "settings"
  );
  const section = () => ({
    id: "settings",
    revision: "first",
    fields: [{ id: "password", type: "secret", required: true }],
    actions: [{ id: "save", kind: "submit", fieldIds: ["password"], target: { kind: "app" } }]
  });
  const first = await actions.run(request, section, () => {
    throw new Error("sensitive upstream error");
  });
  assert.equal(first.status, "unconfirmed");
  assert.equal(JSON.stringify(first).includes("sensitive"), false);
  const raw = await readFile(path.join(directory, "request-12345678.json"), "utf8");
  assert.equal(raw.includes("sensitive"), false);
  let writes = 0;
  const observation = await new ConfigurationActions(directory, "settings").run(request, section, () => {
    writes += 1;
  });
  assert.equal(observation.status, "unconfirmed");
  assert.equal(writes, 0);
  await assert.rejects(
    actions.run({ ...request, requestId: "request-87654321" }, section, () => {
      writes += 1;
    }),
    (error) => error instanceof ConfigurationActionError && error.status === 409
  );
  assert.equal(writes, 0);
});

test("configuration action request validates route, identity, and bounded values", () => {
  const valid = { requestId: "request-12345678", expectedRevision: "first", values: {} };
  assert.deepEqual(assertConfigurationActionRequest(valid, "save", "settings"), {
    ...valid,
    actionId: "save",
    sectionId: "settings"
  });
  assert.throws(() => assertConfigurationActionRequest({ ...valid, actionId: "other" }, "save"));
  assert.throws(() => assertConfigurationActionRequest({ ...valid, requestId: "../other" }, "save"));
  assert.throws(() => assertConfigurationActionRequest({ ...valid, extra: true }, "save"));
});

test("request identities cannot cross actions or sections", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "configuration-actions-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const actions = new ConfigurationActions(directory);
  const section = () => ({
    id: "settings",
    revision: "first",
    fields: [],
    actions: [
      { id: "save", kind: "submit", fieldIds: [], target: { kind: "app" } },
      { id: "other", kind: "submit", fieldIds: [], target: { kind: "app" } }
    ]
  });
  const wire = { requestId: "request-12345678", expectedRevision: "first", values: {} };
  await actions.run(assertConfigurationActionRequest(wire, "save", "settings"), section, async () => {});
  await assert.rejects(
    actions.run(assertConfigurationActionRequest(wire, "other", "settings"), section, async () => {}),
    (error) => error instanceof ConfigurationActionError && error.status === 409
  );
  await assert.rejects(
    actions.run(
      assertConfigurationActionRequest(wire, "save", "another"),
      () => ({ ...section(), id: "another" }),
      async () => {}
    ),
    (error) => error instanceof ConfigurationActionError && error.status === 409
  );
});

test("invalid values are rejected before an operation receipt exists", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "configuration-actions-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const actions = new ConfigurationActions(directory, "settings");
  const section = () => ({
    id: "settings",
    revision: "first",
    fields: [{ id: "style", type: "select", required: true, options: [{ value: "original", label: "Original" }] }],
    actions: [{ id: "save", kind: "submit", fieldIds: ["style"], target: { kind: "app" } }]
  });
  const request = assertConfigurationActionRequest(
    { requestId: "request-12345678", expectedRevision: "first", values: { style: "other" } },
    "save",
    "settings"
  );
  await assert.rejects(
    actions.run(request, section, async () => {}),
    (error) => error.status === 400
  );
  assert.equal(await actions.read(request.requestId), null);
});
