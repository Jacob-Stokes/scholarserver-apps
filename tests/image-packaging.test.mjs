import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { parse } from "yaml";

async function recipes(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "dist") continue;
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...(await recipes(file)));
    else if (entry.name === "Dockerfile") result.push(file);
  }
  return result;
}

test("both Zotero controller entry points ship their imported modules", async () => {
  for (const role of ["controller", "local-api-bridge"]) {
    const recipe = await readFile(`apps/zotero/${role}/Dockerfile`, "utf8");
    for (const module of ["controller.mjs", "status-model.mjs", "research-items.mjs"]) {
      assert.ok(recipe.includes(`apps/zotero/controller/${module}`), `${role} must copy ${module}`);
    }
    assert.ok(recipe.includes("COPY packages/controller-runtime /app/node_modules/@scholarserver/controller-runtime"));
  }
});

test("Obsidian ships the isolated CouchDB readiness helper", async () => {
  const recipe = await readFile("apps/obsidian/sync/Dockerfile", "utf8");
  assert.match(recipe, /COPY .*apps\/obsidian\/sync\/couchdb-request\.mjs \/app\/couchdb-request\.mjs/);
});

test("every distributed custom image pins its base and cannot install official Headless", async () => {
  const files = await recipes("apps");
  assert.equal(files.length, 19, "Existing application recipes plus n8n wrapper and integration");
  for (const file of files) {
    const source = await readFile(file, "utf8");
    for (const line of source.split("\n").filter((line) => line.startsWith("FROM ")))
      assert.match(line, /@sha256:[a-f0-9]{64}(?: AS \S+)?$/, `${file}: immutable base`);
    assert.doesNotMatch(source, /npm install|obsidian-headless/, `${file}: lockfiles, no bundled proprietary client`);
  }
});

test("official client data is excluded, while vaults, credentials and version metadata remain backed up", async () => {
  const manifest = parse(await readFile("apps/obsidian/package/scholarserver-app.yaml", "utf8"));
  const data = new Map(manifest.data.map((item) => [item.id, item]));
  assert.equal(data.get("official-client").backup, "excluded");
  for (const id of ["vault", "headless-config", "runtime", "livesync-db", "livesync-runtime", "livesync-couchdb"])
    assert.notEqual(data.get(id).backup, "excluded");
  const compose = parse(await readFile("apps/obsidian/package/compose.yaml", "utf8"));
  assert.ok(compose.services.sync.volumes.includes("${SCHOLARSERVER_DATA_OFFICIAL_CLIENT}:/official-client"));
  assert.ok(manifest.onboarding.actions.some((item) => item.id === "install-client"));
});

test("runtime launcher is delivered and image-content audit precedes any push", async () => {
  const dockerfile = await readFile("apps/obsidian/sync/Dockerfile", "utf8");
  assert.match(dockerfile, /COPY.*official-client\.mjs.*official-command\.mjs/);
  const script = await readFile("scripts/build-native-images.sh", "utf8");
  assert.ok(script.indexOf("check-image-contents.py") < script.indexOf('docker push "$target"'));
});

test("Logseq sync preview configures account verification, not just an HTTP health endpoint", async () => {
  const compose = parse(await readFile("apps/logseq/development/compose.yaml", "utf8"));
  const { environment, networks } = compose.services.sync;
  assert.equal(environment.COGNITO_ISSUER, "https://cognito-idp.us-east-1.amazonaws.com/us-east-1_dtagLnju8");
  assert.equal(environment.COGNITO_CLIENT_ID, "69cs1lgme7p8kbgld8n5kseii6");
  assert.equal(environment.COGNITO_JWKS_URL, `${environment.COGNITO_ISSUER}/.well-known/jwks.json`);
  assert.match(environment.DB_SYNC_BASE_URL, /LOGSEQ_SYNC_URL/);
  assert.ok(networks.includes("egress"), "Account signing keys must be reachable");
  assert.equal(compose.services.sync.ports, undefined, "Preview does not publish a public host port");
});
