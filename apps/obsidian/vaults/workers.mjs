import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readRegistry, vaultPaths } from "./registry.mjs";

function ensureStorage(directory, root) {
  fs.mkdirSync(root, { recursive: true, mode: 0o700 });
  const relative = path.relative(root, directory);
  if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("Invalid vault storage root.");
  let current = root;
  for (const component of ["", ...relative.split(path.sep).filter(Boolean)]) {
    if (component) current = path.join(current, component);
    try {
      fs.mkdirSync(current, { mode: 0o700 });
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
    }
    const stat = fs.lstatSync(current);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("A vault storage directory needs recovery.");
  }
}

export class VaultWorkers {
  constructor({
    runtime = process.env.OBSIDIAN_RUNTIME_PATH || "/runtime",
    role = "controller",
    roots = {},
    spawnWorker = spawn
  } = {}) {
    this.runtime = runtime;
    this.role = role;
    this.roots = {
      vaults: process.env.OBSIDIAN_VAULTS_PATH || "/vaults",
      legacyVault: process.env.OBSIDIAN_LEGACY_VAULT_PATH || "/vault",
      liveSync: process.env.OBSIDIAN_SHARED_LIVESYNC_PATH || "/livesync-runtime",
      database: process.env.OBSIDIAN_DATABASE_ROOT || "/livesync-db",
      home: process.env.OBSIDIAN_HOME_ROOT || "/home/obsidian",
      ...roots
    };
    this.spawnWorker = spawnWorker;
    this.workers = new Map();
    this.stopping = false;
  }

  reconcile() {
    const registry = readRegistry(this.runtime);
    for (const [index, vault] of registry.vaults.entries()) {
      if (this.role === "livesync" && vault.source !== "livesync") continue;
      const current = this.workers.get(vault.id);
      if (current?.child || (current && current.retryAfter > Date.now())) continue;
      const paths = vaultPaths(vault, { ...this.roots, runtime: this.runtime });
      const vaultRoot = vault.layout === "legacy" ? this.roots.legacyVault : this.roots.vaults;
      const directories =
        this.role === "controller"
          ? [
              [paths.vault, vaultRoot],
              [paths.runtime, this.runtime],
              [paths.liveSync, this.roots.liveSync],
              [paths.home, this.roots.home]
            ]
          : [
              [paths.vault, vaultRoot],
              [paths.liveSync, this.roots.liveSync],
              [paths.database, this.roots.database]
            ];
      try {
        for (const [directory, root] of directories) ensureStorage(directory, root);
      } catch {
        this.workers.set(vault.id, {
          child: null,
          retryAfter: Date.now() + 5000,
          error: "This vault's storage needs recovery."
        });
        continue;
      }
      const basePort = Number(process.env.OBSIDIAN_CONTROLLER_PORT_BASE || "8190");
      if (!Number.isInteger(basePort) || basePort < 1024 || basePort > 65503)
        throw new Error("Invalid private controller port range.");
      const port = basePort + index;
      const entry = this.role === "controller" ? "../sync/controller.mjs" : "../livesync-worker/worker.mjs";
      const environment = {
        ...process.env,
        OBSIDIAN_CONTROLLER_CHILD: "1",
        OBSIDIAN_WORKER_CHILD: "1",
        OBSIDIAN_CONTROLLER_PORT: String(port),
        OBSIDIAN_VAULT_PATH: paths.vault,
        OBSIDIAN_RUNTIME_PATH: paths.runtime,
        OBSIDIAN_HOME_PATH: paths.home,
        OBSIDIAN_LIVESYNC_PATH: paths.liveSync,
        OBSIDIAN_DATABASE_PATH: paths.database,
        OBSIDIAN_SHARED_LIVESYNC_PATH: this.roots.liveSync || "/livesync-runtime",
        SCHOLARSERVER_VARIANT: vault.source === "official" ? "obsidian-sync" : "self-hosted-livesync"
      };
      const child = this.spawnWorker(process.execPath, [fileURLToPath(new URL(entry, import.meta.url))], {
        env: environment,
        stdio: "ignore"
      });
      const worker = { child, port, retryAfter: 0, error: null };
      this.workers.set(vault.id, worker);
      const exited = () => {
        if (worker.child !== child) return;
        worker.child = null;
        worker.error = "This vault's sync controller stopped; its restart is pending.";
        worker.retryAfter = Date.now() + 5000;
      };
      child.once("error", exited);
      child.once("exit", exited);
    }
  }

  async request(id, requestPath, { method = "GET", body, timeoutMs = 20_000 } = {}) {
    const worker = this.workers.get(id);
    if (!worker?.child || this.stopping)
      throw new Error("This vault's sync controller is unavailable. Other connections are unchanged.");
    const response = await fetch(`http://127.0.0.1:${worker.port}${requestPath}`, {
      method,
      ...(body !== undefined ? { body: JSON.stringify(body), headers: { "content-type": "application/json" } } : {}),
      signal: AbortSignal.timeout(timeoutMs)
    });
    const text = await response.text();
    if (text.length > 1024 * 1024) throw new Error("The vault controller returned too much data.");
    const value = JSON.parse(text);
    if (!response.ok) throw new Error(typeof value.error === "string" ? value.error : "This vault operation failed.");
    return value;
  }

  async stop() {
    this.stopping = true;
    await Promise.all(
      [...this.workers.values()].map(async (worker) => {
        if (!worker.child) return;
        const child = worker.child;
        const exited = new Promise((resolve) => child.once("exit", resolve));
        child.kill("SIGTERM");
        const deadline = setTimeout(() => child.kill("SIGKILL"), 10_000);
        await exited;
        clearTimeout(deadline);
      })
    );
  }
}
