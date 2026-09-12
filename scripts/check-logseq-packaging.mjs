#!/usr/bin/env node
// Native local-image acceptance. All graphs are disposable and remain unconnected.
// Required: LOGSEQ_PROOF_HELPER_IMAGE, LOGSEQ_PROOF_MCP_IMAGE, their corresponding
// LOGSEQ_PROOF_*_REVISION values, LOGSEQ_PROOF_ARCH and SCHOLARSERVER_BROWSER_MODULES.
// Optional: LOGSEQ_PROOF_OUTPUT (artifact basename), LOGSEQ_PROOF_SOURCE (fixture root),
// LOGSEQ_PROOF_BROWSER_EXECUTABLE, LOGSEQ_PROOF_UI_PORT (8081 by default).
// On a disposable DO host, also supply LOGSEQ_PROOF_DO_ID and LOGSEQ_PROOF_HOSTNAME.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { access, mkdir, open, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const sourceRoot = path.resolve(process.env.LOGSEQ_PROOF_SOURCE ?? fileURLToPath(new URL("../", import.meta.url)));
const architecture = process.env.LOGSEQ_PROOF_ARCH;
assert.ok(["arm64", "amd64"].includes(architecture), "Provide LOGSEQ_PROOF_ARCH=arm64 or amd64");
const output = path.resolve(
  process.env.LOGSEQ_PROOF_OUTPUT ??
    path.join(sourceRoot, ".dev", "package-refresh-20260912", architecture, "logseq-native")
);
const images = {
  helper: { reference: process.env.LOGSEQ_PROOF_HELPER_IMAGE, revision: process.env.LOGSEQ_PROOF_HELPER_REVISION },
  mcp: { reference: process.env.LOGSEQ_PROOF_MCP_IMAGE, revision: process.env.LOGSEQ_PROOF_MCP_REVISION }
};
for (const [role, image] of Object.entries(images)) {
  assert.ok(image.reference, `Provide LOGSEQ_PROOF_${role.toUpperCase()}_IMAGE`);
  assert.match(image.revision ?? "", /^[a-f0-9]{40}$/, `Provide the full expected ${role} OCI revision`);
}
const uiPort = Number(process.env.LOGSEQ_PROOF_UI_PORT ?? 8081);
assert.ok(Number.isInteger(uiPort) && uiPort > 1024 && uiPort <= 65535, "Invalid loopback UI port");
assert.ok(process.env.SCHOLARSERVER_BROWSER_MODULES, "Provide the existing Playwright module directory");
const require = createRequire(import.meta.url);
const { chromium } = require(path.join(process.env.SCHOLARSERVER_BROWSER_MODULES, "playwright"));
const browserExecutable = process.env.LOGSEQ_PROOF_BROWSER_EXECUTABLE ?? chromium.executablePath();
await access(browserExecutable);

const owner = randomUUID();
const prefix = `scholar-logseq-proof-${owner}`;
const labelKey = "com.scholarserver.logseq-proof";
const resources = [];
const abort = new AbortController();
const signals = new Map();
for (const signal of ["SIGINT", "SIGTERM"]) {
  const handler = () => abort.abort(new Error(`Interrupted by ${signal}`));
  signals.set(signal, handler);
  process.once(signal, handler);
}
const evidence = {
  startedAt: new Date().toISOString(),
  architecture,
  prefix,
  scope: "Disposable unsynced graph and unconfigured managed UI; no account or encrypted-sync acceptance",
  images: {},
  fixtures: {},
  assertions: [],
  resources,
  cleanup: []
};
let log;
let browser;
let failed = false;

async function record(message) {
  console.log(message);
  if (log) await log.write(`${message}\n`);
}

async function passed(message) {
  evidence.assertions.push(message);
  await record(`PASS: ${message}`);
}

function docker(args, { input, timeout = 60_000, cleanup = false } = {}) {
  return new Promise((resolve, reject) => {
    const child = execFile(
      "docker",
      args,
      { timeout, maxBuffer: 2 * 1024 * 1024, signal: cleanup ? undefined : abort.signal },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(`docker ${args[0]} ${args[1]} failed: ${stderr.slice(-6000) || error.message}`));
          return;
        }
        resolve((args[0] === "logs" ? stdout + stderr : stdout).trim());
      }
    );
    child.stdin.on("error", () => {});
    child.stdin.end(input);
  });
}

async function inspect(type, name, cleanup = false) {
  try {
    const result = await docker([type, "inspect", name], { cleanup });
    return JSON.parse(result)[0];
  } catch (error) {
    if (/No such (object|container|volume|network)|not found/i.test(error.message)) return null;
    throw error;
  }
}

async function reserve(type, role) {
  const name = `${prefix}-${role}`;
  assert.equal(await inspect(type, name), null, `Refusing to adopt an existing ${type}: ${name}`);
  resources.push({ type, name });
  return name;
}

async function assertHostAndImages() {
  const expectedId = process.env.LOGSEQ_PROOF_DO_ID;
  const expectedHostname = process.env.LOGSEQ_PROOF_HOSTNAME;
  if (expectedId || expectedHostname) {
    assert.ok(expectedId && expectedHostname, "Both DigitalOcean ID and hostname guards are required");
    const response = await fetch("http://169.254.169.254/metadata/v1/id", { signal: AbortSignal.timeout(5000) });
    assert.equal(response.status, 200, "DigitalOcean metadata must be readable");
    assert.equal((await response.text()).trim(), expectedId, "DigitalOcean ID differs");
    assert.equal(os.hostname(), expectedHostname, "Hostname differs");
    evidence.host = { id: expectedId, hostname: expectedHostname };
  }
  const nativeNames = { aarch64: "arm64", arm64: "arm64", x86_64: "amd64", x64: "amd64", amd64: "amd64" };
  assert.equal(nativeNames[process.arch], architecture, "Node host must be native");
  assert.equal(await docker(["info", "--format", "{{.OSType}}"]), "linux");
  assert.equal(nativeNames[await docker(["info", "--format", "{{.Architecture}}"])], architecture);
  for (const [role, image] of Object.entries(images)) {
    const info = JSON.parse(await docker(["image", "inspect", image.reference]))[0];
    assert.equal(info.Os, "linux");
    assert.equal(info.Architecture, architecture, `${role} must be native`);
    assert.equal(info.Config.Labels?.["org.opencontainers.image.revision"], image.revision, `${role} OCI revision`);
    assert.equal(Object.keys(info.Config.Volumes ?? {}).length, 0, "Images must not create anonymous data volumes");
    evidence.images[role] = { reference: image.reference, id: info.Id, architecture, revision: image.revision };
  }
  if (process.env.LOGSEQ_PROOF_MCP_IMAGE_RECORD) {
    const value = JSON.parse(await readFile(process.env.LOGSEQ_PROOF_MCP_IMAGE_RECORD, "utf8"));
    const info = Array.isArray(value) ? value[0] : value;
    assert.equal(info.Id, evidence.images.mcp.id, "MCP completion record must match the local image");
    evidence.mcpImageRecord = process.env.LOGSEQ_PROOF_MCP_IMAGE_RECORD;
  }
}

async function checkPort() {
  const socket = createServer();
  await new Promise((resolve, reject) => {
    socket.once("error", reject);
    socket.listen(uiPort, "127.0.0.1", resolve);
  });
  await new Promise((resolve, reject) => socket.close((error) => (error ? reject(error) : resolve())));
}

async function createVolumes(roles) {
  const volumes = {};
  for (const role of roles) {
    const name = await reserve("volume", role);
    await docker(["volume", "create", "--label", `${labelKey}=${owner}`, name]);
    volumes[role] = name;
  }
  const initializer = await reserve("container", `initialize-${roles[0]}`);
  const mounts = Object.values(volumes).flatMap((name, index) => [
    "--mount",
    `type=volume,source=${name},target=/proof/${index},volume-nocopy`
  ]);
  await docker([
    "create",
    "--name",
    initializer,
    "--label",
    `${labelKey}=${owner}`,
    "--pull",
    "never",
    "--network",
    "none",
    "--user",
    "0:0",
    "--read-only",
    "--cap-drop",
    "ALL",
    "--cap-add",
    "CHOWN",
    "--security-opt",
    "no-new-privileges:true",
    "--pids-limit",
    "32",
    "--memory",
    "128m",
    ...mounts,
    "--entrypoint",
    "node",
    evidence.images.helper.id,
    "--input-type=module",
    "-e",
    `import assert from 'node:assert/strict';
     import { readdir, chown, chmod, stat } from 'node:fs/promises';
     for (let index = 0; index < ${roles.length}; index++) {
       const directory = '/proof/' + index;
       assert.equal((await readdir(directory)).length, 0, 'Only empty new volumes may be initialized');
       await chmod(directory, 0o700);
       await chown(directory, 1000, 1000);
       const info = await stat(directory);
       assert.equal(info.uid, 1000); assert.equal(info.gid, 1000);
     }`
  ]);
  await docker(["start", "--attach", initializer]);
  assert.equal((await inspect("container", initializer)).State.ExitCode, 0, "Volume initialization must pass");
  await docker(["rm", initializer]);
  return volumes;
}

function mount(volume, target, readOnly = false) {
  let value = `type=volume,source=${volume},target=${target},volume-nocopy`;
  if (readOnly) value += ",readonly";
  return ["--mount", value];
}

async function start(role, imageRole, network, args) {
  const name = await reserve("container", role);
  const memory = imageRole === "helper" ? "1536m" : "256m";
  await docker([
    "create",
    "--name",
    name,
    "--label",
    `${labelKey}=${owner}`,
    "--pull",
    "never",
    "--network",
    network,
    "--network-alias",
    role,
    "--user",
    "1000:1000",
    "--read-only",
    "--cap-drop",
    "ALL",
    "--security-opt",
    "no-new-privileges:true",
    "--pids-limit",
    "128",
    "--memory",
    memory,
    "--tmpfs",
    "/tmp:rw,noexec,nosuid,nodev,size=64m",
    ...args,
    evidence.images[imageRole].id
  ]);
  await docker(["start", name]);
  const info = await inspect("container", name);
  assert.equal(info.Config.User, "1000:1000");
  assert.equal(info.HostConfig.ReadonlyRootfs, true);
  assert.deepEqual(info.HostConfig.CapDrop, ["ALL"]);
  assert.ok(info.HostConfig.SecurityOpt.includes("no-new-privileges:true"));
  assert.equal(info.HostConfig.PidsLimit, 128);
  assert.equal(info.HostConfig.Memory, Number.parseInt(memory, 10) * 1024 * 1024);
  assert.equal(info.HostConfig.Tmpfs["/tmp"], "rw,noexec,nosuid,nodev,size=64m");
  assert.ok(
    info.Mounts.filter((entry) => entry.Type === "volume").every((entry) => entry.Name.startsWith(`${prefix}-`))
  );
  return name;
}

function probe(container, code) {
  return docker(["exec", "-i", container, "node", "--input-type=module"], { input: code });
}

async function waitHealthy(container, port) {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    const info = await inspect("container", container);
    assert.equal(info?.State.Running, true, `${container} exited before health passed`);
    try {
      await probe(
        container,
        `const r = await fetch('http://127.0.0.1:${port}/health', {signal: AbortSignal.timeout(2000)}); if (!r.ok) process.exit(1);`
      );
      return;
    } catch {
      abort.signal.throwIfAborted();
    }
    await delay(1000, undefined, { signal: abort.signal });
  }
  throw new Error(`Health deadline exceeded for ${container}:${port}`);
}

async function graphProof(mcp, scripts, phase) {
  for (const [name, script] of Object.entries(scripts)) {
    await record(`Running ${name}; phase=${phase}`);
    const result = await docker(
      ["exec", "-i", "--env", `LOGSEQ_PROOF_PHASE=${phase}`, mcp, "node", "--input-type=module"],
      { input: script, timeout: 180_000 }
    );
    await record(result);
  }
  await passed(`${phase}: both repository graph/MCP proofs completed`);
}

async function checkManaged(container) {
  await probe(
    container,
    `
    import assert from 'node:assert/strict';
    import { stat } from 'node:fs/promises';
    assert.equal(process.env.LOGSEQ_MANAGED_SETUP, '1');
    assert.equal(process.env.LOGSEQ_SYNC_CONFIG, '/sync-config');
    const status = await (await fetch('http://127.0.0.1:8081/api/status')).json();
    assert.equal(status.phase, 'setup'); assert.equal(status.ready, false);
    assert.equal(status.accountConnected, false); assert.equal(status.account.state, 'idle');
    assert.equal(status.graph, null); assert.equal(status.syncAddress, null);
    assert.equal(status.addressRequired, true);
    assert.equal((await fetch('http://127.0.0.1:8080/health')).status, 503);
    for (const file of ['/home/node/logseq/auth.json', '/home/node/logseq/graphs', '/sync-config/address.json']) {
      await assert.rejects(stat(file), {code: 'ENOENT'});
    }
    const token = await stat('/runtime/service-token');
    assert.equal(token.mode & 0o777, 0o600); assert.equal(token.uid, 1000);
  `
  );
  await passed("Managed default: setup health is ready; graph, account and private address remain unconfigured");
}

async function screenshotManaged() {
  const origin = `http://127.0.0.1:${uiPort}`;
  browser = await chromium.launch({ executablePath: browserExecutable, headless: true });
  const context = await browser.newContext({ viewport: { width: 1360, height: 960 }, serviceWorkers: "block" });
  const blocked = [];
  const pageErrors = [];
  const responses = [];
  await context.route("**/*", async (route) => {
    const request = route.request();
    if (new URL(request.url()).origin !== origin || request.method() !== "GET") {
      blocked.push(`${request.method()} ${new URL(request.url()).pathname}`);
      await route.abort();
      return;
    }
    await route.continue();
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("response", (response) =>
    responses.push({ path: new URL(response.url()).pathname, status: response.status() })
  );
  try {
    const response = await page.goto(`${origin}/configuration`, { waitUntil: "networkidle", timeout: 30_000 });
    assert.equal(response.status(), 200);
    await page.getByRole("heading", { name: "Logseq", exact: true }).waitFor();
    await page.getByRole("heading", { name: "Private connection", exact: true }).waitFor();
    await page.getByRole("button", { name: "Set up private connection", exact: true }).waitFor();
    assert.equal((await page.locator(".ss-badge").textContent()).trim(), "Setup needed");
    assert.ok(responses.some((entry) => entry.path.endsWith(".js") && entry.status === 200));
    assert.ok(responses.some((entry) => entry.path.endsWith(".css") && entry.status === 200));
    assert.deepEqual(pageErrors, [], "Built UI must have no uncaught browser errors");
    assert.deepEqual(blocked, [], "The setup screen must not attempt external or mutating requests");
    const failures = responses.filter((entry) => entry.status >= 400);
    assert.ok(failures.every((entry) => entry.path.endsWith("/endpoints/sync/access-options") && entry.status === 404));
    evidence.browser = { url: `${origin}/configuration`, pageErrors, blocked, managerRouteResponses: failures };
    await passed("Built managed UI rendered its setup screen and JS/CSS at loopback; no account action occurred");
    await record(
      "LIMIT: Standalone Manager access-options route is unavailable; enrollment and encrypted/account sync are untested."
    );
  } finally {
    await page.screenshot({ path: `${output}.png`, fullPage: true });
    await browser.close();
    browser = null;
  }
}

async function cleanup() {
  const errors = [];
  if (browser) {
    try {
      await browser.close();
    } catch (error) {
      errors.push(error.message);
    }
  }
  // Reverse creation order releases consumers before their exact network/volumes.
  for (const resource of [...resources].reverse()) {
    try {
      const info = await inspect(resource.type, resource.name, true);
      if (info) {
        const labels = resource.type === "container" ? info.Config.Labels : info.Labels;
        assert.equal(labels?.[labelKey], owner, `Refusing cleanup of an unowned ${resource.name}`);
        const args = [resource.type, "rm"];
        if (resource.type === "container") args.push("--force");
        await docker([...args, resource.name], { cleanup: true });
      }
      assert.equal(await inspect(resource.type, resource.name, true), null);
      evidence.cleanup.push({ ...resource, absent: true });
      await record(`CLEAN: ${resource.type} ${resource.name} absent`);
    } catch (error) {
      errors.push(error.message);
      await record(`CLEANUP FAILED: ${resource.name}: ${error.message}`);
    }
  }
  if (errors.length) throw new Error(`${errors.length} cleanup checks failed; exact names are recorded above`);
}

try {
  await assertHostAndImages();
  await checkPort();
  const scripts = {};
  for (const name of ["check-mcp.mjs", "check-research-mcp.mjs"]) {
    scripts[name] = await readFile(path.join(sourceRoot, "apps/logseq/development", name), "utf8");
    evidence.fixtures[name] = createHash("sha256").update(scripts[name]).digest("hex");
  }
  evidence.runnerSha256 = createHash("sha256")
    .update(await readFile(fileURLToPath(import.meta.url)))
    .digest("hex");
  await mkdir(path.dirname(output), { recursive: true });
  log = await open(`${output}.log`, "wx");
  await record(
    JSON.stringify({ architecture, prefix, host: evidence.host, images: evidence.images, fixtures: evidence.fixtures })
  );
  await passed("Native host and both local image IDs/OCI revisions verified before fixture creation");
  const network = await reserve("network", "graph");
  await docker(["network", "create", "--internal", "--label", `${labelKey}=${owner}`, network]);
  assert.equal((await inspect("network", network)).Internal, true);
  const volumes = await createVolumes(["graph", "runtime"]);
  const helper = await start("helper", "helper", network, [
    "--env",
    "LOGSEQ_MANAGED_SETUP=0",
    "--env",
    "LOGSEQ_SYNC_CONFIG=",
    ...mount(volumes.graph, "/graph"),
    ...mount(volumes.runtime, "/runtime")
  ]);
  await waitHealthy(helper, 8080);
  const mcp = await start("mcp", "mcp", network, mount(volumes.runtime, "/runtime", true));
  await waitHealthy(mcp, 7013);
  await passed(
    "Unsynced helper and MCP started with package user, read-only root, capability, memory, PID and tmpfs limits"
  );
  await graphProof(mcp, scripts, "fresh");
  await docker(["restart", "--time", "20", helper, mcp]);
  await waitHealthy(helper, 8080);
  await waitHealthy(mcp, 7013);
  await graphProof(mcp, scripts, "restart");
  await docker(["stop", "--time", "20", mcp, helper]);

  // Docker does not publish ports from an internal-only network. This separate
  // owned bridge serves only the fresh setup screen, bound to host loopback.
  const uiNetwork = await reserve("network", "ui");
  await docker(["network", "create", "--label", `${labelKey}=${owner}`, uiNetwork]);
  const managedVolumes = await createVolumes(["managed-graph", "managed-runtime", "managed-sync-config"]);
  const managed = await start("managed", "helper", uiNetwork, [
    "--publish",
    `127.0.0.1:${uiPort}:8081`,
    ...mount(managedVolumes["managed-graph"], "/home/node/logseq"),
    ...mount(managedVolumes["managed-runtime"], "/runtime"),
    ...mount(managedVolumes["managed-sync-config"], "/sync-config")
  ]);
  await waitHealthy(managed, 8081);
  const managedInfo = await inspect("container", managed);
  assert.deepEqual(managedInfo.NetworkSettings.Ports["8081/tcp"], [{ HostIp: "127.0.0.1", HostPort: String(uiPort) }]);
  assert.equal(
    (await fetch(`http://127.0.0.1:${uiPort}/health`, { signal: AbortSignal.timeout(5000) })).status,
    200,
    "Managed UI must be reachable through the loopback-only published port"
  );
  await checkManaged(managed);
  await screenshotManaged();
  await checkManaged(managed);
  for (const [role, image] of Object.entries(images)) {
    assert.equal(JSON.parse(await docker(["image", "inspect", image.reference]))[0].Id, evidence.images[role].id);
  }
  await passed("Image tags still resolve to their original IDs");
} catch (error) {
  failed = true;
  evidence.failure = error.message;
  await record(`FAIL: ${error.message}`);
  for (const resource of resources.filter((entry) => entry.type === "container")) {
    try {
      const info = await inspect("container", resource.name, true);
      if (info?.Config.Labels?.[labelKey] !== owner) continue;
      await record(
        JSON.stringify({
          container: resource.name,
          running: info.State.Running,
          exitCode: info.State.ExitCode,
          oomKilled: info.State.OOMKilled
        })
      );
      await record(await docker(["logs", "--tail", "30", resource.name], { cleanup: true }));
    } catch {
      /* Cleanup still runs if diagnostics are unavailable. */
    }
  }
} finally {
  try {
    await cleanup();
  } catch (error) {
    failed = true;
    evidence.cleanupFailure = error.message;
  }
  evidence.finishedAt = new Date().toISOString();
  evidence.result = failed ? "failed" : "passed";
  if (log) {
    await writeFile(`${output}.json`, `${JSON.stringify(evidence, null, 2)}\n`, { flag: "wx" });
    await record(`RESULT: ${evidence.result}; artifacts=${output}.{log,json,png}`);
    await log.close();
  }
  for (const [signal, handler] of signals) process.removeListener(signal, handler);
}
if (failed) process.exitCode = 1;
