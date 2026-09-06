import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

export function privateSyncAddress(value) {
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    !url.hostname.endsWith(".ts.net") ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/" ||
    !url.port ||
    Number(url.port) < 12000 ||
    Number(url.port) >= 52000
  )
    throw new Error("Choose the private sync address supplied by ScholarServer.");
  return url.origin;
}

export async function readSyncAddress(file) {
  try {
    const value = JSON.parse(await readFile(file, "utf8"));
    return privateSyncAddress(value.url);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

export async function runSync({ file, start, intervalMs = 2000 }) {
  let child;
  let address;
  let stopping = false;
  let changing = false;
  async function stopChild() {
    if (!child?.pid || child.exitCode !== null || child.signalCode !== null) return;
    const current = child;
    await new Promise((resolve) => {
      current.once("exit", resolve);
      current.kill("SIGTERM");
      const timeout = setTimeout(() => current.kill("SIGKILL"), 10_000);
      current.once("exit", () => clearTimeout(timeout));
    });
  }
  async function reconcile() {
    if (stopping || changing) return;
    changing = true;
    try {
      const next = await readSyncAddress(file);
      if (child && next === address) return;
      // The upstream process reads its public asset URL at startup. Stop it
      // before applying a changed address; never run two database writers.
      await stopChild();
      if (stopping) return;
      address = next;
      child = start(address ?? "http://sync:8787");
      child.once("error", () => {
        process.exitCode = 1;
        void close();
      });
      child.once("exit", () => {
        if (!stopping && !changing) {
          process.exitCode = 1;
          void close();
        }
      });
    } finally {
      changing = false;
    }
  }
  let timer;
  async function close() {
    stopping = true;
    clearInterval(timer);
    await stopChild();
  }
  await reconcile();
  timer = setInterval(() => {
    void reconcile().catch(() => {
      // Invalid configuration must not replace a working address or leak data.
      console.error("Logseq sync address needs attention.");
    });
  }, intervalMs);
  return close;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const close = await runSync({
    file: "/sync-config/address.json",
    start: (url) =>
      spawn(process.execPath, ["/app/worker/dist/node-adapter.js"], {
        cwd: "/app",
        env: { ...process.env, DB_SYNC_BASE_URL: url },
        // Upstream output can include authentication details. Health and setup
        // report status separately; do not forward raw output to container logs.
        stdio: "ignore"
      })
  });
  for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => void close());
}
