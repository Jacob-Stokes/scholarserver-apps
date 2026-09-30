// Paired-source protocol acceptance, using disposable synthetic vaults.
// This runs the actual Gateway, app MCP transport and app API. A loopback-only
// fixture bridge supplies the synthetic app token because operator machines do
// not have the container's /run/secrets mount. Container credential-file mounting,
// real account sync, deployment and retained migration remain separate gates.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer, request } from "node:http";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { serve } from "@hono/node-server";
import { createApi } from "../apps/obsidian/api/src/server.mjs";
import { addVault, initializeRegistry, updateVaultSettings, vaultPaths } from "../apps/obsidian/vaults/registry.mjs";

const coreRoot = process.argv[2];
assert.ok(coreRoot, "Supply the exact paired core checkout; run with its tsx loader.");
const requireCore = createRequire(path.resolve(coreRoot, "apps/gateway/package.json"));
const { Client, StreamableHTTPClientTransport } = await import(requireCore.resolve("@modelcontextprotocol/client"));
const { closeGateway, listenGateway } = await import(
  pathToFileURL(path.resolve(coreRoot, "apps/gateway/src/server.ts"))
);
const root = await mkdtemp(path.join(tmpdir(), "obsidian-gateway-proof-"));
const token = randomBytes(32).toString("base64url");
const roots = Object.fromEntries(
  ["runtime", "vaults", "legacyVault", "liveSync", "database", "home"].map((name) => [name, path.join(root, name)])
);
let apiServer, bridge, gateway, mcp, client;
let diagnostic = "";

async function listen(server) {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return server.address().port;
}
async function waitForHealth(url) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("The isolated MCP did not become healthy.");
}
async function tool(name, arguments_) {
  const result = await client.callTool({ name, arguments: arguments_ });
  assert.equal(result.isError, undefined, `Gateway tool failed: ${name}: ${JSON.stringify(result)}`);
  return JSON.parse(result.content.find((item) => item.type === "text").text);
}

try {
  initializeRegistry({ runtime: roots.runtime, legacyVault: roots.legacyVault });
  const vaults = [
    addVault(roots.runtime, 1, { label: "Research", source: "official" }, "research"),
    addVault(roots.runtime, 2, { label: "Notes", source: "livesync" }, "notes")
  ];
  for (const vault of vaults) {
    const storage = vaultPaths(vault, roots);
    await mkdir(storage.runtime, { recursive: true });
    await mkdir(path.join(storage.vault, "Research"), { recursive: true });
    await writeFile(path.join(storage.vault, "Research/Same.md"), `Synthetic ${vault.id}`);
    const remote = `synthetic-${vault.id}`;
    const enrollment = { profile: vault.source, scopePath: "Research" };
    if (vault.source === "official") enrollment.remoteVault = remote;
    else enrollment.database = remote;
    for (const [name, value] of [
      ["enrollment.json", enrollment],
      ["status.json", { state: "ready" }],
      ["vault-binding.json", { version: 1, profile: vault.source, vaultId: remote }]
    ])
      await writeFile(path.join(storage.runtime, name), JSON.stringify(value));
  }
  const app = createApi({ runtime: roots.runtime, roots, expectedKey: () => token, multiVault: true });
  apiServer = serve({ fetch: app.fetch, hostname: "127.0.0.1", port: 0 });
  if (!apiServer.listening) await once(apiServer, "listening");
  const apiPort = apiServer.address().port;
  const reservation = createServer();
  const mcpPort = await listen(reservation);
  await new Promise((resolve) => reservation.close(resolve));
  const serverModule = fileURLToPath(new URL("../apps/obsidian/mcp/dist/server.js", import.meta.url));
  mcp = spawn(process.execPath, [serverModule], {
    env: {
      ...process.env,
      PORT: String(mcpPort),
      MCP_BEARER_TOKEN: token,
      OBSIDIAN_API_KEY: token,
      OBSIDIAN_BASE_URL: `http://127.0.0.1:${apiPort}`,
      MCP_OAUTH_ISSUER: ""
    },
    stdio: ["ignore", "ignore", "pipe"]
  });
  mcp.stderr.on("data", (bytes) => {
    diagnostic += bytes.toString();
  });
  await waitForHealth(`http://127.0.0.1:${mcpPort}/health`);
  assert.equal((await fetch(`http://127.0.0.1:${mcpPort}/mcp`, { method: "POST", body: "{}" })).status, 401);
  bridge = createServer((incoming, outgoing) => {
    const upstream = request(
      {
        hostname: "127.0.0.1",
        port: mcpPort,
        method: incoming.method,
        path: incoming.url,
        headers: { ...incoming.headers, authorization: `Bearer ${token}`, host: `127.0.0.1:${mcpPort}` }
      },
      (response) => {
        outgoing.writeHead(response.statusCode, response.headers);
        response.pipe(outgoing);
      }
    );
    upstream.on("error", () => {
      outgoing.writeHead(502);
      outgoing.end();
    });
    incoming.pipe(upstream);
  });
  const bridgePort = await listen(bridge);
  const registryPath = path.join(root, "gateway.json");
  await writeFile(
    registryPath,
    JSON.stringify({
      schemaVersion: 1,
      installationId: "synthetic-installation",
      workspaceId: "synthetic-workspace",
      integrations: [
        {
          id: "obsidian",
          displayName: "Obsidian",
          namespace: "obsidian",
          kind: "mcp",
          enabled: true,
          endpoint: `http://localhost:${bridgePort}/mcp`
        }
      ]
    })
  );
  gateway = await listenGateway(
    {
      host: "127.0.0.1",
      port: 0,
      registryPath,
      accessMode: "local",
      authentication: { mode: "network" },
      allowedHostnames: ["127.0.0.1", "localhost"],
      allowedOriginHostnames: ["127.0.0.1", "localhost"]
    },
    () => {}
  );
  client = new Client({ name: "paired-obsidian-gateway-proof", version: "1" });
  await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${gateway.address().port}/mcp`)));
  const tools = (await client.listTools()).tools;
  const contentTools = tools.filter((item) => item.name.startsWith("obsidian_"));
  assert.equal(contentTools.length, 20);
  assert.equal(new Set(tools.map((item) => item.name)).size, tools.length);
  for (const item of contentTools.filter((item) => item.name !== "obsidian_list_vaults"))
    assert.ok(item.inputSchema.required.includes("vault_id"));
  assert.deepEqual(
    (await tool("obsidian_list_vaults", {})).vaults.map((vault) => vault.id),
    ["research", "notes"]
  );
  for (const vault of vaults) {
    const existing = await tool("obsidian_get_note", { vault_id: vault.id, path: "Research/Same.md" });
    assert.ok(JSON.stringify(existing).includes(`Synthetic ${vault.id}`));
    await tool("obsidian_write_note", {
      vault_id: vault.id,
      path: "Research/Gateway.md",
      content: `Gateway ${vault.id}`,
      mode: "create"
    });
    assert.equal(
      await readFile(path.join(vaultPaths(vault, roots).vault, "Research/Gateway.md"), "utf8"),
      `Gateway ${vault.id}`
    );
    const bytes = Buffer.from([0, 127, 128, 255, vault.id.length]);
    await tool("obsidian_attachments", {
      vault_id: vault.id,
      action: "write",
      path: "Research/Gateway.bin",
      content_base64: bytes.toString("base64")
    });
    const attachment = await tool("obsidian_attachments", {
      vault_id: vault.id,
      action: "read",
      path: "Research/Gateway.bin"
    });
    assert.deepEqual(Buffer.from(attachment.contentBase64, "base64"), bytes);
  }
  const missing = await client
    .callTool({ name: "obsidian_get_note", arguments: { path: "Research/Same.md" } })
    .catch(() => ({ isError: true }));
  assert.ok(missing.isError, "a content call never defaults to a vault");
  const outside = await client.callTool({
    name: "obsidian_get_note",
    arguments: { vault_id: "research", path: "Private.md" }
  });
  assert.ok(outside.isError);
  updateVaultSettings(roots.runtime, 3, "notes", { label: "Notes", aiEnabled: false });
  assert.deepEqual(
    (await tool("obsidian_list_vaults", {})).vaults.map((vault) => vault.id),
    ["research"]
  );
  const revoked = await client.callTool({
    name: "obsidian_write_note",
    arguments: { vault_id: "notes", path: "Research/Denied.md", content: "must not write" }
  });
  assert.ok(revoked.isError);
  await assert.rejects(readFile(path.join(vaultPaths(vaults[1], roots).vault, "Research/Denied.md")), {
    code: "ENOENT"
  });
  assert.equal(diagnostic, "");
  console.log(
    "PASS: actual paired Gateway -> authenticated app MCP -> app API, one 20-tool inventory, explicit selection, same-path read/write isolation, binary attachments, saved scope and immediate per-vault revocation"
  );
  console.log(
    "LIMIT: synthetic ready records and a loopback fixture credential bridge; no native secret mount, real sync, deployment or retained migration is inferred"
  );
} finally {
  if (client) await client.close();
  if (gateway) await closeGateway(gateway);
  for (const server of [bridge, apiServer]) {
    if (server) {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    }
  }
  if (mcp && mcp.exitCode === null) {
    const exiting = once(mcp, "exit");
    mcp.kill("SIGTERM");
    const deadline = setTimeout(() => mcp.kill("SIGKILL"), 10_000);
    await exiting;
    clearTimeout(deadline);
  }
  await rm(root, { recursive: true, force: true });
}
