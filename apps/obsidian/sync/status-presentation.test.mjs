import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { publicStatus, readDeviceOnboarding } from "./status-presentation.mjs";

const state = { profile: "livesync", state: "livesync-device-setup", scopePath: "/" };
const onboarding = {
  accessMethod: "tailscale",
  connectionUrl: "https://example.test",
  setupURI: "obsidian://setuplivesync?settings=synthetic",
  setupPassphrase: "synthetic-only",
  database: "private",
  revision: 1
};

test("routine status excludes root, nested and future private fields", () => {
  const result = publicStatus({ ...state, ...onboarding, liveSyncOnboarding: onboarding, token: "private" });
  assert.deepEqual(Object.keys(result), [
    "state",
    "profile",
    "remoteVault",
    "scopePath",
    "lastSyncAt",
    "lastError",
    "workerRunning"
  ]);
  assert(!JSON.stringify(result).includes("synthetic-only"));
});

test("device details require a valid binding and expose only the setup presentation", async () => {
  const calls = [];
  const result = await readDeviceOnboarding({
    currentState: () => state,
    assertBinding: async () => calls.push("binding"),
    readOnboarding: async () => {
      calls.push("read");
      return onboarding;
    }
  });
  assert.deepEqual(calls, ["binding", "read"]);
  assert.deepEqual(Object.keys(result), ["accessMethod", "connectionUrl", "setupURI", "setupPassphrase"]);
});

test("ordinary, complete and recovery states do not read credentials", async () => {
  for (const current of [
    { ...state, profile: "official" },
    { ...state, state: "ready" },
    { ...state, state: "recovery-required" }
  ]) {
    assert.equal(
      await readDeviceOnboarding({
        currentState: () => current,
        assertBinding: () => assert.fail("binding read"),
        readOnboarding: () => assert.fail("credential read")
      }),
      null
    );
  }
});

test("binding failure prevents the credential read", async () => {
  await assert.rejects(
    readDeviceOnboarding({
      currentState: () => state,
      assertBinding: async () => {
        throw new Error("binding changed");
      },
      readOnboarding: () => assert.fail("credential read")
    }),
    /binding changed/
  );
});

test("a concurrent transition discards the credential response", async () => {
  let current = state;
  assert.equal(
    await readDeviceOnboarding({
      currentState: () => current,
      assertBinding: async () => {},
      readOnboarding: async () => {
        current = { ...state, state: "livesync-server-joining" };
        return onboarding;
      }
    }),
    null
  );
});

test("controller wires a separate no-store browser read and packages its helper", async () => {
  const controller = await readFile(new URL("./controller.mjs", import.meta.url), "utf8");
  const summary = controller.slice(
    controller.indexOf("async function statusSummary()"),
    controller.indexOf("async function action(")
  );
  assert(!summary.includes("liveSyncOnboarding"));
  assert(controller.includes('url.pathname === "/api/livesync/onboarding"'));
  assert(controller.includes('response.setHeader("Cache-Control", "no-store")'));
  assert((await readFile(new URL("./Dockerfile", import.meta.url), "utf8")).includes("/app/status-presentation.mjs"));
});
