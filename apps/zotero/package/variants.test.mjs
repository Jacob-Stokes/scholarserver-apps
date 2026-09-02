import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { parse } from "yaml";

const packageRoot = new URL("./", import.meta.url);

async function packageFiles() {
  const manifest = parse(await readFile(new URL("scholarserver-app.yaml", packageRoot), "utf8"));
  const compose = parse(await readFile(new URL("compose.yaml", packageRoot), "utf8"));
  return { manifest, compose };
}

test("Zotero setup options represent distinct desktop and online architectures", async () => {
  const { manifest } = await packageFiles();
  const complete = manifest.variants.find((candidate) => candidate.id === "complete-workspace");
  const online = manifest.variants.find((candidate) => candidate.id === "online-library");
  assert.deepEqual(complete.services, ["desktop", "local-api-bridge", "controller", "automations", "mcp"]);
  assert.deepEqual(online.services, ["controller", "mcp"]);
  assert.equal(complete.recommended, true);
  assert.equal(online.recommended, false);
  assert.ok(!online.data.includes("desktop-config"));
  assert.ok(!online.data.includes("automation-state"));
});

test("controller and MCP do not share the desktop network namespace", async () => {
  const { manifest, compose } = await packageFiles();
  assert.equal(compose.services.controller.network_mode, undefined);
  assert.equal(compose.services.mcp.network_mode, undefined);
  assert.equal(compose.services["local-api-bridge"].network_mode, "service:desktop");
  assert.equal(manifest.endpoints.find((endpoint) => endpoint.id === "app-ui").service, "controller");
  assert.equal(manifest.endpoints.find((endpoint) => endpoint.id === "mcp").service, "mcp");
  assert.equal(manifest.endpoints.find((endpoint) => endpoint.id === "mcp").gateway.hostname, "zotero-mcp");
  assert.deepEqual(manifest.endpoints.find((endpoint) => endpoint.id === "desktop").public, {
    defaultSubdomain: "zotero",
    audience: "authenticated"
  });
  assert.deepEqual(compose.services.mcp.networks.instance.aliases, ["zotero-mcp"]);
  assert.deepEqual(compose.services.desktop.expose, ["3000"]);
});

test("the bare desktop address launches noVNC with its proxied WebSocket path", async () => {
  const { desktopLaunchUrl } = await import("../desktop/scholarserver-launch.mjs");
  assert.equal(
    desktopLaunchUrl("https://research.example.test/apps/zotero/endpoints/desktop/"),
    "https://research.example.test/apps/zotero/endpoints/desktop/vnc.html?autoconnect=1&reconnect=1&resize=remote&path=apps%2Fzotero%2Fendpoints%2Fdesktop%2Fwebsockify"
  );
  assert.equal(
    desktopLaunchUrl("http://127.0.0.1:3000/"),
    "http://127.0.0.1:3000/vnc.html?autoconnect=1&reconnect=1&resize=remote&path=websockify"
  );
});
