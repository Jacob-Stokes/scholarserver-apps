import assert from "node:assert/strict";
import test from "node:test";
import { configuredWorkerFile, daemonStateFromOutput } from "./worker-state.mjs";

test("daemon output only reports ready after initial mirroring is complete", () => {
  assert.equal(daemonStateFromOutput("[Ready] LiveSync is running"), null);
  assert.deepEqual(daemonStateFromOutput("[Daemon] Initialized, NOW TRACKING!"), { state: "ready", lastError: null });
});

test("a remote rebuild lock is surfaced as a blocked state", () => {
  assert.deepEqual(daemonStateFromOutput("[Headless] Locked: Remote database is locked"), {
    state: "blocked",
    lastError: "The first Obsidian device has not finished preparing LiveSync yet"
  });
});

test("one-time setup credentials are removed after the worker is configured", () => {
  assert.deepEqual(configuredWorkerFile({ revision: 12, setupURI: "secret-uri", setupPassphrase: "secret" }), {
    enabled: true,
    configured: true,
    revision: 12
  });
});
