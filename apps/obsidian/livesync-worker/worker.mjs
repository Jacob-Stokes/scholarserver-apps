import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

const runtime = "/livesync-runtime";
const database = "/livesync-db";
const vault = "/vault";
const configPath = path.join(runtime, "livesync-worker.json");
const statusPath = path.join(runtime, "livesync-worker-status.json");
const settingsPath = path.join(database, ".livesync", "settings.json");
let child = null;
let appliedFingerprint = null;
let activeRevision = null;
let status = { state: "waiting", running: false, lastError: null, lastStartedAt: null };

async function atomicJson(file, value) {
  const temporary = `${file}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  await rename(temporary, file);
}

async function update(patch) {
  status = { ...status, ...patch, running: child !== null };
  await atomicJson(statusPath, status);
}

function runCli(args, stdin = null) {
  return new Promise((resolve, reject) => {
    const process = spawn("node", ["/app/dist/index.cjs", database, ...args], { stdio: ["pipe", "pipe", "pipe"] });
    let output = "";
    process.stdout.on("data", (chunk) => { output += chunk; });
    process.stderr.on("data", (chunk) => { output += chunk; });
    if (stdin !== null) process.stdin.end(`${stdin}\n`); else process.stdin.end();
    process.once("error", reject);
    process.once("exit", (code) => code === 0 ? resolve(output) : reject(new Error(output.trim() || `LiveSync CLI exited ${code}`)));
  });
}

async function stop() {
  if (!child) return;
  const current = child;
  child = null;
  current.kill("SIGTERM");
  await new Promise((resolve) => current.once("exit", resolve));
  activeRevision = null;
}

async function start(config) {
  await mkdir(path.dirname(settingsPath), { recursive: true });
  const fingerprint = `${config.revision}:${config.setupURI?.length ?? 0}`;
  if (config.setupURI && config.setupPassphrase && appliedFingerprint !== fingerprint) {
    await runCli(["--settings", settingsPath, "setup", config.setupURI], config.setupPassphrase);
    appliedFingerprint = fingerprint;
  } else if (!config.setupURI) {
    await readFile(settingsPath, "utf8");
  }
  child = spawn("node", ["/app/dist/index.cjs", database, "--settings", settingsPath, "--vault", vault, "--interval", "30", "daemon"], {
    stdio: ["ignore", "inherit", "inherit"]
  });
  activeRevision = config.revision;
  await update({ state: "running", lastError: null, lastStartedAt: new Date().toISOString() });
  child.once("exit", (code) => {
    child = null;
    void update({ state: "stopped", lastError: code === 0 ? null : `LiveSync worker exited ${code}` });
  });
}

async function reconcile() {
  let config;
  try { config = JSON.parse(await readFile(configPath, "utf8")); } catch { config = null; }
  if (!config?.enabled) {
    await stop();
    if (status.state !== "waiting") await update({ state: "waiting", lastError: null });
    return;
  }
  if (child && activeRevision !== config.revision) await stop();
  if (!child) {
    try { await start(config); }
    catch (error) { await update({ state: "error", lastError: error instanceof Error ? error.message.slice(0, 1000) : "LiveSync failed" }); }
  }
}

createServer((_request, response) => {
  response.setHeader("Content-Type", "application/json");
  response.end(JSON.stringify(status));
}).listen(8081, "0.0.0.0");

await mkdir(database, { recursive: true });
await update({});
for (;;) {
  await reconcile();
  await new Promise((resolve) => setTimeout(resolve, 2_000));
}
