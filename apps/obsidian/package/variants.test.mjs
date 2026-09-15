import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { parse } from "yaml";

const manifest = parse(await readFile(new URL("./scholarserver-app.yaml", import.meta.url), "utf8"));
const compose = parse(await readFile(new URL("./compose.yaml", import.meta.url), "utf8"));
const liveSync = manifest.variants.find((variant) => variant.id === "self-hosted-livesync");
const official = manifest.variants.find((variant) => variant.id === "obsidian-sync");

test("LiveSync keeps exactly its six existing datasets and never selects the official client cache", () => {
  assert.deepEqual(liveSync.data, [
    "vault",
    "headless-config",
    "runtime",
    "livesync-db",
    "livesync-runtime",
    "livesync-couchdb"
  ]);
  const expected = {
    vault: ["/vault", "filesystem-consistent", 1000, 1000, "0750"],
    "headless-config": ["/home/obsidian/.config", "filesystem-consistent", 1000, 1000, "0700"],
    runtime: ["/runtime", "reproducible", 1000, 1000, "0700"],
    "livesync-db": ["/livesync-db", "filesystem-consistent", 1000, 1000, "0700"],
    "livesync-runtime": ["/livesync-runtime", "reproducible", 1000, 1000, "0755"],
    "livesync-couchdb": ["/opt/couchdb/data", "application-consistent", 5984, 5984, "0700"]
  };
  for (const id of liveSync.data) {
    const data = manifest.data.find((entry) => entry.id === id);
    assert.deepEqual(
      [data.mountPath, data.backup, data.filesystem.uid, data.filesystem.gid, data.filesystem.mode],
      expected[id]
    );
    assert.equal(data.retention, "preserve");
  }
});

test("official Sync retains its excluded persistent cache and all existing datasets", () => {
  assert.deepEqual(official.data, ["vault", "headless-config", "runtime", "official-client", "livesync-runtime"]);
  assert.deepEqual(
    manifest.data.find((entry) => entry.id === "official-client"),
    {
      id: "official-client",
      mountPath: "/official-client",
      owner: "obsidian",
      filesystem: { uid: 1000, gid: 1000, mode: "0700" },
      backup: "excluded",
      retention: "preserve"
    }
  );
  assert.ok(compose.services.sync.volumes.includes("${SCHOLARSERVER_DATA_OFFICIAL_CLIENT}:/official-client"));
});

test("the core projection contract removes only the official-client mount for LiveSync", () => {
  // Package-side expectations only. The core worker must test actual projection
  // and executor rendering; this test does not substitute its own renderer.
  const dataByPlaceholder = new Map(
    manifest.data.map((data) => [`\${SCHOLARSERVER_DATA_${data.id.replaceAll("-", "_").toUpperCase()}}`, data.id])
  );
  for (const [variant, expectedInactive] of [
    [liveSync, ["sync:official-client"]],
    [official, []]
  ]) {
    const inactive = [];
    for (const service of variant.services) {
      for (const mount of compose.services[service].volumes ?? []) {
        const id = dataByPlaceholder.get(mount.split(":")[0]);
        assert.ok(id, "Every volume must name a declared managed dataset");
        if (!variant.data.includes(id)) inactive.push(`${service}:${id}`);
      }
    }
    assert.deepEqual(inactive, expectedInactive);
    const endpoint = manifest.endpoints.find((entry) => entry.id === manifest.ui.endpoint);
    assert.equal(endpoint.service, "sync");
    assert.ok(variant.services.includes(endpoint.service));
  }
});

test("research actions use the runtime mailbox and protect note contents", () => {
  assert.equal(manifest.packageVersion, "0.5.0-guided.20260915.1");
  const browse = manifest.onboarding.actions.filter((action) => action.id === "browse-folders");
  const create = manifest.onboarding.actions.filter((action) => action.id === "create-research-note");
  assert.deepEqual(browse, [
    {
      id: "browse-folders",
      data: "runtime",
      timeoutSeconds: 10,
      fields: [{ id: "path", type: "string", secret: false, required: false }]
    }
  ]);
  assert.deepEqual(create, [
    {
      id: "create-research-note",
      data: "runtime",
      timeoutSeconds: 30,
      fields: [
        { id: "folder", type: "string", secret: false, required: true },
        { id: "filename", type: "string", secret: false, required: true },
        { id: "content", type: "string", secret: true, required: true }
      ]
    }
  ]);
  for (const image of manifest.images) assert.equal(compose.services[image.service].image, image.reference);
});
