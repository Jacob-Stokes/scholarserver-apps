import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { ManagerConnection } from "./manager-connection.mjs";

const valid = {
  url: "http://scholarserver-manager:8080/api/v1/service",
  token: "a".repeat(43)
};

test("Manager connection persists only the platform-issued service credential", async (context) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "n8n-manager-connection-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const connection = new ManagerConnection(directory);
  await connection.configure(valid);
  assert.deepEqual(await connection.read(), valid);
  assert.equal((await stat(connection.file)).mode & 0o777, 0o600);
  assert.deepEqual(JSON.parse(await readFile(connection.file, "utf8")), valid);
});

test("Manager connection rejects caller-selected addresses and malformed tokens", async (context) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "n8n-manager-connection-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const connection = new ManagerConnection(directory);
  await assert.rejects(connection.configure({ ...valid, url: "http://example.org" }));
  await assert.rejects(connection.configure({ ...valid, token: "short" }));
  await assert.rejects(connection.read(), /Reconnect/);
});
