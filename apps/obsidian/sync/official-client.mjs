import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rename, rm, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { x as extract } from "tar";

// Metadata only. The proprietary package is fetched on the user's server,
// never by the image build or release workflow.
export const approvedClient = Object.freeze({
  version: "0.0.14",
  url: "https://registry.npmjs.org/obsidian-headless/-/obsidian-headless-0.0.14.tgz",
  integrity: "sha512-S1d/hxLKvCUG2g5tRyXFkzPqMs3Ntw1tDyzoF2yfHGRuB4B+Mi3X2vgT8LbfQKrkEEi3LfJRdXtYzAVHcbpccw=="
});

const maxDownload = 8 * 1024 * 1024;
const packageFiles = new Set([
  "package/package.json",
  "package/cli.js",
  "package/README.md",
  "package/btime/darwin-arm64/btime.node",
  "package/btime/darwin-x64/btime.node",
  "package/btime/win32-arm64/btime.node",
  "package/btime/win32-ia32/btime.node",
  "package/btime/win32-x64/btime.node"
]);

export function verifyDownload(bytes, integrity = approvedClient.integrity) {
  const actual = `sha512-${createHash("sha512").update(bytes).digest("base64")}`;
  if (actual !== integrity) throw new Error("The Obsidian download failed its integrity check. Please retry.");
}

async function download(release, fetcher, report) {
  const response = await fetcher(release.url, { redirect: "error", signal: AbortSignal.timeout(120_000) });
  if (!response.ok || !response.body) throw new Error("Could not download Obsidian from npm. Please retry.");
  const chunks = [];
  let received = 0;
  for await (const chunk of response.body) {
    received += chunk.length;
    if (received > maxDownload) throw new Error("The Obsidian download was unexpectedly large. Installation stopped.");
    chunks.push(chunk);
    report({ phase: "downloading", receivedBytes: received });
  }
  return Buffer.concat(chunks);
}

export function createOfficialClient({
  root = "/official-client",
  dependencies = "/app/node_modules",
  fetcher = fetch,
  release = approvedClient
} = {}) {
  let operation = null;
  let progress = { phase: "not-installed", version: null, approvedVersion: release.version, error: null };
  const installed = path.join(root, "installed");

  async function inspect() {
    try {
      const record = JSON.parse(await readFile(path.join(installed, "receipt.json"), "utf8"));
      if (record.integrity !== release.integrity || record.version !== release.version) return null;
      for (const file of ["cli.js", "package.json", "README.md"]) {
        const bytes = await readFile(path.join(installed, "package", file));
        if (record.files?.[file] !== createHash("sha256").update(bytes).digest("hex")) return null;
      }
      return record;
    } catch (error) {
      if (error.code === "EACCES")
        throw new Error("Cannot read the downloaded Obsidian client. Check storage permissions.");
      return null;
    }
  }

  async function status() {
    if (operation) return { ...progress };
    const receipt = await inspect();
    if (receipt) return { ...progress, phase: "installed", version: receipt.version, error: null };
    return { ...progress, phase: progress.phase === "failed" ? "failed" : "not-installed", version: null };
  }

  async function install() {
    let stage;
    try {
      await mkdir(root, { recursive: true, mode: 0o700 });
      progress = { ...progress, phase: "downloading", error: null, receivedBytes: 0 };
      const bytes = await download(release, fetcher, (patch) => {
        progress = { ...progress, ...patch };
      });
      progress = { ...progress, phase: "verifying" };
      verifyDownload(bytes, release.integrity);
      stage = await mkdtemp(path.join(root, ".install-"));
      const archive = path.join(stage, "download.tgz");
      await writeFile(archive, bytes, { mode: 0o600 });
      let unexpectedEntry = false;
      const seen = new Set();
      await extract({
        file: archive,
        cwd: stage,
        strict: true,
        noChmod: true,
        filter: (name, entry) => {
          if (!packageFiles.has(name) || entry.type !== "File" || seen.has(name) || entry.size > 1024 * 1024) {
            unexpectedEntry = true;
            return false;
          }
          seen.add(name);
          return true;
        }
      });
      if (unexpectedEntry) throw new Error("Unexpected file in Obsidian download.");
      const metadata = JSON.parse(await readFile(path.join(stage, "package/package.json"), "utf8"));
      if (
        metadata.name !== "obsidian-headless" ||
        metadata.version !== release.version ||
        metadata.dependencies?.commander !== "14.0.3" ||
        metadata.dependencies?.["better-sqlite3"] !== "12.11.1"
      ) {
        throw new Error("The downloaded client does not match the approved version.");
      }
      await symlink(dependencies, path.join(stage, "package/node_modules"));
      const files = {};
      for (const file of ["cli.js", "package.json", "README.md"]) {
        files[file] = createHash("sha256")
          .update(await readFile(path.join(stage, "package", file)))
          .digest("hex");
      }
      await writeFile(path.join(stage, "receipt.json"), JSON.stringify({ ...release, files }), { mode: 0o600 });
      await rm(archive);
      // The controller stops sync before installation. Keep the previous copy
      // until the complete verified directory is ready; interruptions are retryable.
      await rm(path.join(root, "previous"), { recursive: true, force: true });
      await rename(installed, path.join(root, "previous")).catch((error) => {
        if (error.code !== "ENOENT") throw error;
      });
      await rename(stage, installed);
      stage = null;
      progress = { ...progress, phase: "installed", version: release.version, error: null };
    } catch (error) {
      progress = {
        ...progress,
        phase: "failed",
        error: "Could not install the Obsidian client. Check connectivity and free disk space, then retry."
      };
      if (error.message?.includes("integrity check")) progress.error = error.message;
      throw new Error(progress.error);
    } finally {
      if (stage) await rm(stage, { recursive: true, force: true });
    }
  }

  function begin({ confirmed = false, profile } = {}) {
    if (profile !== "official") throw new Error("Official client installation is only available with Obsidian Sync.");
    if (!confirmed) throw new Error("Confirm the Obsidian download and terms before proceeding.");
    if (operation) return operation;
    operation = install().finally(() => {
      operation = null;
    });
    return operation;
  }

  async function entrypoint() {
    if (!(await inspect())) throw new Error("Choose Install and connect to download the official Obsidian client.");
    return path.join(installed, "package/cli.js");
  }
  return { status, begin, entrypoint };
}
