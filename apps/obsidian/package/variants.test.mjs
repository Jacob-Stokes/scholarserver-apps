import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { parse } from "yaml";
import "../sync/couchdb-address.test.mjs";

const manifest = parse(await readFile(new URL("./scholarserver-app.yaml", import.meta.url), "utf8"));
const compose = parse(await readFile(new URL("./compose.yaml", import.meta.url), "utf8"));
test("one workspace installation runs the shared stack without an installation-wide sync variant", () => {
  assert.deepEqual(manifest.tenancy, { mode: "per-workspace", maxInstancesPerWorkspace: 1 });
  assert.equal(manifest.variants, undefined);
  assert.deepEqual(Object.keys(compose.services), ["sync", "api", "mcp", "livesync-couchdb", "livesync-worker"]);
  assert.deepEqual(
    manifest.ui.configuration.sections.map((section) => section.id),
    ["vaults", "setup", "access"]
  );
});

test("the new layout preserves every older data root and keeps authoritative registry and credentials in backup", () => {
  const expected = {
    vault: ["/vault", "filesystem-consistent", 1000, 1000, "0750"],
    vaults: ["/vaults", "filesystem-consistent", 1000, 1000, "0700"],
    "headless-config": ["/home/obsidian/.config", "filesystem-consistent", 1000, 1000, "0700"],
    runtime: ["/runtime", "filesystem-consistent", 1000, 1000, "0700"],
    "livesync-db": ["/livesync-db", "filesystem-consistent", 1000, 1000, "0700"],
    "livesync-runtime": ["/livesync-runtime", "filesystem-consistent", 1000, 1000, "0755"],
    "livesync-couchdb": ["/opt/couchdb/data", "application-consistent", 5984, 5984, "0700"],
    "official-client": ["/official-client", "excluded", 1000, 1000, "0700"]
  };
  assert.equal(manifest.data.length, Object.keys(expected).length);
  for (const data of manifest.data) {
    assert.deepEqual(
      [data.mountPath, data.backup, data.filesystem.uid, data.filesystem.gid, data.filesystem.mode],
      expected[data.id]
    );
    assert.equal(data.retention, "preserve");
  }
});

test("multi-vault adoption requires executor data recovery", () => {
  assert.equal(manifest.lifecycle.rollback, "backup-required");
});

test("all volumes are declared and the excluded official client cache retains its previous contract", () => {
  const dataByPlaceholder = new Map(
    manifest.data.map((data) => [`\${SCHOLARSERVER_DATA_${data.id.replaceAll("-", "_").toUpperCase()}}`, data])
  );
  for (const service of Object.values(compose.services)) {
    for (const mount of service.volumes ?? []) {
      const [placeholder, destination] = mount.split(":");
      const data = dataByPlaceholder.get(placeholder);
      assert.ok(data, "Every volume must name a declared managed dataset");
      assert.equal(destination, data.mountPath);
    }
  }
  assert.deepEqual(
    manifest.data.find((data) => data.id === "official-client"),
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
  for (const role of ["sync", "api", "livesync-worker"]) {
    assert.ok(compose.services[role].volumes.includes("${SCHOLARSERVER_DATA_VAULTS}:/vaults"));
  }
  assert.ok(compose.services["livesync-worker"].volumes.includes("${SCHOLARSERVER_DATA_RUNTIME}:/runtime:ro"));
});

test("research actions use the runtime mailbox and protect note contents", () => {
  const browse = manifest.onboarding.actions.filter((action) => action.id === "browse-folders");
  const create = manifest.onboarding.actions.filter((action) => action.id === "create-research-note");
  assert.deepEqual(browse, [
    {
      id: "browse-folders",
      data: "runtime",
      timeoutSeconds: 30,
      requireInstanceApproval: true,
      fields: [
        { id: "vaultId", type: "string", secret: false, required: true },
        { id: "path", type: "string", secret: false, required: false }
      ]
    }
  ]);
  assert.deepEqual(create, [
    {
      id: "create-research-note",
      data: "runtime",
      timeoutSeconds: 30,
      fields: [
        { id: "vaultId", type: "string", secret: false, required: true },
        { id: "folder", type: "string", secret: false, required: true },
        { id: "filename", type: "string", secret: false, required: true },
        { id: "content", type: "string", secret: true, required: true }
      ]
    }
  ]);
  for (const image of manifest.images) assert.equal(compose.services[image.service].image, image.reference);
});

test("only the app-owned folder browsing action requires target-instance approval", () => {
  assert.deepEqual(
    manifest.onboarding.actions.filter((action) => action.requireInstanceApproval).map((action) => action.id),
    ["browse-folders"]
  );
  for (const action of manifest.onboarding.actions.filter((action) => action.id !== "browse-folders")) {
    assert.equal(Object.hasOwn(action, "requireInstanceApproval"), false);
  }
});

test("LiveSync uses an opt-in private origin and keeps its database off the shared edge network", () => {
  const endpoint = manifest.endpoints.find((entry) => entry.id === "livesync-couchdb");
  assert.deepEqual(endpoint, {
    id: "livesync-couchdb",
    service: "livesync-couchdb",
    port: 5984,
    protocol: "http",
    exposure: "human-optional",
    auth: "none-private",
    remoteAccess: {
      routing: "origin",
      private: true,
      public: false,
      authentik: "unsupported",
      defaultAuthentik: false
    }
  });
  assert.deepEqual(compose.services["livesync-couchdb"].networks, {
    instance: {
      aliases: ["livesync-couchdb", "obsidian-db-${SCHOLARSERVER_WORKSPACE_ID}-${SCHOLARSERVER_INSTANCE_ID}"]
    }
  });
  assert.equal(compose.services.sync.environment.SCHOLARSERVER_WORKSPACE_ID, "${SCHOLARSERVER_WORKSPACE_ID}");
  assert.equal(compose.services.sync.environment.SCHOLARSERVER_INSTANCE_ID, "${SCHOLARSERVER_INSTANCE_ID}");
  assert.equal(compose.services["livesync-couchdb"].ports, undefined);
});

test("only supported mailbox actions remain and every one requires explicit vault selection", () => {
  assert.deepEqual(
    manifest.onboarding.actions.map((action) => action.id),
    ["browse-folders", "create-research-note", "status"]
  );
  for (const action of manifest.onboarding.actions) {
    assert.deepEqual(action.fields[0], { id: "vaultId", type: "string", secret: false, required: true });
  }
});
