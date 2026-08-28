import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir, open, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const vaultPath = "/vault";
const runtimePath = "/runtime";
const requestsPath = path.join(runtimePath, "requests");
const responsesPath = path.join(runtimePath, "responses");
const statusPath = path.join(runtimePath, "status.json");
const tokenPath = path.join(runtimePath, "service-token");
const enrollmentPath = path.join(runtimePath, "enrollment.json");
const scopePath = path.join(runtimePath, "scope-path");

let syncProcess = null;
let state = {
  state: "setup-required",
  remoteVault: null,
  lastSyncAt: null,
  lastError: null,
  workerRunning: false,
};

async function atomicJson(filePath, value, mode = 0o600) {
  const temporary = `${filePath}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode });
  await rename(temporary, filePath);
}

async function updateStatus(patch = {}) {
  state = { ...state, ...patch, workerRunning: syncProcess !== null };
  await atomicJson(statusPath, state, 0o644);
}

async function ensureServiceToken() {
  try {
    const current = (await readFile(tokenPath, "utf8")).trim();
    if (current.length >= 32) return;
  } catch {}
  const file = await open(tokenPath, "wx", 0o600).catch(() => null);
  if (!file) return;
  try {
    await file.writeFile(`${randomBytes(32).toString("base64url")}\n`);
    await file.sync();
  } finally {
    await file.close();
  }
}

function runOb(args, { credentialKind = null } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn("ob", args, {
      cwd: vaultPath,
      env: { HOME: "/home/obsidian", PATH: process.env.PATH },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) return resolve(stdout.trim());
      const commandOutput = `${stderr}\n${stdout}`;
      let detail = stderr.trim() || stdout.trim() || `ob exited ${code}`;
      if (credentialKind === "account") detail = "Obsidian account sign-in was not accepted";
      if (credentialKind === "vault") {
        detail = /wrong vault key|validate password/i.test(commandOutput)
          ? "Vault encryption password was not accepted"
          : "Obsidian could not open the selected vault";
      }
      reject(new Error(detail));
    });
  });
}

async function listRemoteVaults() {
  const output = await runOb(["sync-list-remote", "--json"]);
  const parsed = JSON.parse(output || "[]");
  return Array.isArray(parsed) ? parsed : (parsed.vaults ?? []);
}

async function login(input) {
  if (typeof input.email !== "string" || !input.email.includes("@")) throw new Error("A valid email is required");
  if (typeof input.password !== "string" || input.password.length === 0) throw new Error("Password is required");
  const args = ["login", "--email", input.email, "--password", input.password];
  if (typeof input.mfa === "string" && input.mfa.length > 0) args.push("--mfa", input.mfa);
  await runOb(args, { credentialKind: "account" });
  const vaults = await listRemoteVaults();
  await updateStatus({ state: "vault-selection-required", lastError: null });
  return { state: "vault-selection-required", vaults };
}

async function connectVault(input) {
  if (typeof input.vault !== "string" || input.vault.length === 0) throw new Error("Remote vault is required");
  const setup = ["sync-setup", "--vault", input.vault, "--path", vaultPath, "--device-name", "ScholarServer", "--json"];
  if (typeof input.encryptionPassword === "string" && input.encryptionPassword.length > 0) setup.push("--password", input.encryptionPassword);
  await runOb(setup, { credentialKind: "vault" });

  // An empty server replica must never upload before the first successful pull.
  await runOb(["sync-config", "--path", vaultPath, "--mode", "pull-only", "--json"]);
  await updateStatus({ state: "initial-sync", remoteVault: input.vault, lastError: null });
  await runOb(["sync", "--path", vaultPath]);
  await runOb(["sync-config", "--path", vaultPath, "--mode", "bidirectional", "--json"]);
  const mcpScope = typeof input.scopePath === "string" && input.scopePath.trim() ? input.scopePath.trim() : "/";
  await writeFile(scopePath, `${mcpScope}\n`, { mode: 0o600 });
  await atomicJson(enrollmentPath, { remoteVault: input.vault, mode: "bidirectional", scopePath: mcpScope });
  startContinuousSync();
  await updateStatus({ state: "ready", remoteVault: input.vault, lastSyncAt: new Date().toISOString(), lastError: null });
  return { ...state, workerRunning: true };
}

function startContinuousSync() {
  if (syncProcess) return;
  syncProcess = spawn("ob", ["sync", "--path", vaultPath, "--continuous"], {
    cwd: vaultPath,
    env: { HOME: "/home/obsidian", PATH: process.env.PATH },
    stdio: ["ignore", "inherit", "inherit"],
  });
  syncProcess.once("exit", (code) => {
    syncProcess = null;
    void updateStatus({ lastError: code === 0 ? null : "Continuous sync stopped" });
    setTimeout(() => { if (state.state === "ready") startContinuousSync(); }, 5_000);
  });
}

async function action(request) {
  switch (request.action) {
    case "status": {
      if (state.state !== "vault-selection-required") return state;
      try {
        return { ...state, vaults: await listRemoteVaults() };
      } catch {
        await updateStatus({ state: "setup-required" });
        return state;
      }
    }
    case "login": return login(request.input ?? {});
    case "connect-vault": return connectVault(request.input ?? {});
    default: throw new Error("Unsupported onboarding action");
  }
}

async function processRequest(fileName) {
  const requestFile = path.join(requestsPath, fileName);
  const responseFile = path.join(responsesPath, fileName);
  let response;
  try {
    const request = JSON.parse(await readFile(requestFile, "utf8"));
    response = { ok: true, result: await action(request) };
  } catch (error) {
    await updateStatus({ lastError: error instanceof Error ? error.message : "Onboarding failed" });
    response = { ok: false, error: error instanceof Error ? error.message : "Onboarding failed" };
  } finally {
    await rm(requestFile, { force: true });
  }
  await atomicJson(responseFile, response);
}

async function restore() {
  try {
    const enrollment = JSON.parse(await readFile(enrollmentPath, "utf8"));
    state = { ...state, state: "ready", remoteVault: enrollment.remoteVault };
    startContinuousSync();
  } catch {}
  await updateStatus();
}

await mkdir(vaultPath, { recursive: true });
await mkdir(requestsPath, { recursive: true });
await mkdir(responsesPath, { recursive: true });
await ensureServiceToken();
await restore();

for (;;) {
  const files = (await readdir(requestsPath)).filter((name) => /^[a-z0-9-]+\.json$/.test(name)).sort();
  for (const file of files) await processRequest(file);
  await new Promise((resolve) => setTimeout(resolve, 250));
}
