#!/usr/bin/env node
// Native final-image proof. Uses an unconnected disposable profile, never an account.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { promisify } from "node:util";

const execute = promisify(execFile);
async function docker(...args) {
  const result = await execute("docker", args, { maxBuffer: 4 * 1024 * 1024 });
  return result.stdout.trim();
}
const roles = ["controller", "desktop", "local-api-bridge", "automations", "mcp"];
const images = new Map();
for (const role of roles) {
  const variable = `ZOTERO_${role.replaceAll("-", "_").toUpperCase()}_IMAGE`;
  assert.ok(process.env[variable], `Provide ${variable}`);
  images.set(role, process.env[variable]);
}
const hostArchitecture = await docker("info", "--format", "{{.Architecture}}");
const architecture = { aarch64: "arm64", arm64: "arm64", x86_64: "amd64", amd64: "amd64" }[hostArchitecture];
assert.ok(architecture, "A supported native Docker host is required");
for (const image of images.values()) {
  assert.equal(
    await docker("image", "inspect", image, "--format", "{{.Os}}/{{.Architecture}}"),
    `linux/${architecture}`
  );
}
const prefix = `scholar-zotero-proof-${randomUUID().slice(0, 8)}`;
const containers = [];
const volumes = [];
let networkCreated = false;
let browser;

async function waitFor(description, check, seconds = 120) {
  const deadline = Date.now() + seconds * 1000;
  while (Date.now() < deadline) {
    try {
      if (await check()) {
        console.log(`PASS: ${description}`);
        return;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`Timed out: ${description}`);
}

async function start(role, args) {
  const name = `${prefix}-${role}`;
  containers.push(name);
  await docker(
    "run",
    "-d",
    "--name",
    name,
    "--read-only",
    "--cap-drop",
    "ALL",
    "--security-opt",
    "no-new-privileges:true",
    "--pids-limit",
    "256",
    "--memory",
    role === "desktop" ? "1536m" : "256m",
    "--cpus",
    "1",
    ...args,
    images.get(role)
  );
  return name;
}
async function probe(container, code) {
  return docker("exec", container, "node", "--input-type=module", "-e", code);
}
async function healthy(container, port) {
  return (await probe(container, `console.log((await fetch('http://127.0.0.1:${port}/health')).status)`)) === "200";
}
const mount = (volume, target, readOnly = false) => `${prefix}-${volume}:${target}${readOnly ? ":ro" : ""}`;

try {
  await docker("network", "create", prefix);
  networkCreated = true;
  for (const role of ["runtime", "config", "data", "linked", "state", "cache"]) {
    const name = `${prefix}-${role}`;
    await docker("volume", "create", name);
    volumes.push(name);
    await docker(
      "run",
      "--rm",
      "--network",
      "none",
      "--user",
      "0",
      "--entrypoint",
      "sh",
      "-v",
      `${name}:/proof`,
      images.get("controller"),
      "-c",
      "chown 10001:10001 /proof && chmod 700 /proof"
    );
  }
  const desktop = await start("desktop", [
    "--network",
    prefix,
    "--network-alias",
    "desktop",
    "--tmpfs",
    "/tmp:rw,nosuid,nodev,size=256m,mode=1777",
    "--tmpfs",
    "/run:rw,nosuid,nodev,size=32m,mode=0755",
    "-v",
    mount("config", "/config"),
    "-v",
    mount("data", "/data"),
    "-v",
    mount("runtime", "/runtime"),
    "-v",
    mount("linked", "/linked")
  ]);
  const bridge = await start("local-api-bridge", [
    "--network",
    `container:${desktop}`,
    "-v",
    mount("runtime", "/runtime")
  ]);
  const controller = await start("controller", [
    "--network",
    prefix,
    "--network-alias",
    "controller",
    "-p",
    "127.0.0.1::8080",
    "-v",
    mount("runtime", "/runtime"),
    "-v",
    mount("data", "/data", true),
    "-v",
    mount("linked", "/linked", true),
    "-v",
    mount("cache", "/cache")
  ]);
  const worker = await start("automations", [
    "--network",
    prefix,
    "--network-alias",
    "automations",
    "-v",
    mount("state", "/state"),
    "-v",
    mount("linked", "/linked", true)
  ]);
  const mcp = await start("mcp", [
    "--network",
    prefix,
    "--network-alias",
    "mcp",
    "-v",
    mount("runtime", "/runtime", true),
    "-v",
    mount("data", "/data", true),
    "-v",
    mount("linked", "/linked", true)
  ]);
  await waitFor("corrected local API bridge starts non-root and read-only", () => healthy(bridge, 8082));
  assert.equal(await docker("exec", bridge, "id", "-u"), "10001");
  await probe(
    bridge,
    `
    import assert from 'node:assert/strict';
    import { stat } from 'node:fs/promises';
    assert.equal((await stat('/runtime/local-api-bridge-token')).mode & 0o777, 0o600);
    assert.equal((await fetch('http://127.0.0.1:8082/api/users/0/items')).status, 401);
    assert.equal((await fetch('http://127.0.0.1:8082/api/users/0/items', {headers:{'x-scholarserver-bridge':'incorrect'}})).status, 401);
    assert.equal((await fetch('http://127.0.0.1:8082/not-an-api')).status, 404);
  `
  );
  await waitFor("real Zotero desktop plugin responds to controller health", () => healthy(controller, 8080));
  await waitFor("automation worker starts", () => healthy(worker, 8081));
  await waitFor("MCP starts", () => healthy(mcp, 7012));
  await probe(
    bridge,
    `
    import assert from 'node:assert/strict';
    import { readFile } from 'node:fs/promises';
    const token=(await readFile('/runtime/local-api-bridge-token','utf8')).trim();
    const response=await fetch('http://127.0.0.1:8082/connector/ping',{headers:{'x-scholarserver-bridge':token}});
    assert.equal(response.status,200);
  `
  );
  console.log("PASS: bridge rejects missing/wrong tokens and forwards authorized requests to the real desktop");
  if (process.env.SCHOLARSERVER_BROWSER_MODULES) {
    const require = createRequire(path.join(process.env.SCHOLARSERVER_BROWSER_MODULES, "package.json"));
    const { chromium } = require("playwright");
    browser = await chromium.launch({ channel: "chrome", headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const endpoint = await docker("port", controller, "8080/tcp");
    await page.goto(`http://${endpoint}/`);
    await page.getByRole("heading", { name: "Zotero", exact: true }).waitFor();
    const output = path.resolve(process.env.SCHOLARSERVER_EVIDENCE ?? ".dev/zotero-packaging");
    await mkdir(output, { recursive: true });
    await page.screenshot({ path: path.join(output, `zotero-native-${architecture}.png`), fullPage: true });
    assert.deepEqual(errors, []);
  }
  const before = await probe(
    bridge,
    "import {createHash} from 'node:crypto'; import {readFile} from 'node:fs/promises'; console.log(createHash('sha256').update(await readFile('/runtime/local-api-bridge-token')).digest('hex'));"
  );
  await docker("restart", bridge, controller, worker, mcp);
  await waitFor("controller recovers after restart", () => healthy(controller, 8080));
  await waitFor("bridge recovers after restart", () => healthy(bridge, 8082));
  const after = await probe(
    bridge,
    "import {createHash} from 'node:crypto'; import {readFile} from 'node:fs/promises'; console.log(createHash('sha256').update(await readFile('/runtime/local-api-bridge-token')).digest('hex'));"
  );
  assert.equal(after, before);
  console.log(
    `PASS: native ${architecture} Zotero startup, desktop bridge, protected token, UI and restart; no account or sync acceptance claimed`
  );
} finally {
  await browser?.close();
  for (const name of containers.reverse()) await docker("rm", "-f", name).catch(() => undefined);
  for (const name of volumes) await docker("volume", "rm", name);
  if (networkCreated) await docker("network", "rm", prefix);
  assert.equal(await docker("ps", "-aq", "--filter", `name=${prefix}`), "");
  assert.equal(await docker("volume", "ls", "-q", "--filter", `name=${prefix}`), "");
  console.log("PASS: disposable Zotero containers, volumes and network removed");
}
