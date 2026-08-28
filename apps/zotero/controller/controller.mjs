import { createHash, randomBytes, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, mkdir, open, readFile, readdir, realpath, rename, rm, stat, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const runtimePath = "/runtime";
const requestsPath = path.join(runtimePath, "requests");
const responsesPath = path.join(runtimePath, "responses");
const statusPath = path.join(runtimePath, "status.json");
const serviceTokenPath = path.join(runtimePath, "service-token");
const serverIdPath = path.join(runtimePath, "local-server-id");
const configurationPath = path.join(runtimePath, "configuration.json");
const localApiKeyPath = path.join(runtimePath, "local-api-key");
const zoteroBaseUrl = "http://127.0.0.1:23119/api";
const connectorPingUrl = "http://127.0.0.1:23119/connector/ping";
const storageModes = new Set(["zotero-storage", "webdav", "linked-folder", "server-only"]);

async function atomicWrite(filePath, content, mode = 0o600) {
  const temporary = `${filePath}.${process.pid}.tmp`;
  await writeFile(temporary, content, { mode });
  await rename(temporary, filePath);
}

async function atomicJson(filePath, value, mode = 0o600) {
  await atomicWrite(filePath, `${JSON.stringify(value, null, 2)}\n`, mode);
}

async function ensureRandomFile(filePath, bytes = 32) {
  try {
    const current = (await readFile(filePath, "utf8")).trim();
    if (current) return current;
  } catch {}
  const file = await open(filePath, "wx", 0o600).catch(() => null);
  if (file) {
    try {
      await file.writeFile(`${bytes === 16 ? randomUUID() : randomBytes(bytes).toString("base64url")}\n`);
      await file.sync();
    } finally {
      await file.close();
    }
  }
  return (await readFile(filePath, "utf8")).trim();
}

async function configuration() {
  try { return JSON.parse(await readFile(configurationPath, "utf8")); }
  catch { return null; }
}

async function localApiKey() {
  try { return (await readFile(localApiKeyPath, "utf8")).trim(); }
  catch { return ""; }
}

async function api(pathname, init = {}) {
  const key = await localApiKey();
  const response = await fetch(`${zoteroBaseUrl}${pathname}`, {
    ...init,
    headers: {
      Accept: "application/json",
      "Zotero-API-Version": "3",
      ...(key ? { "Zotero-API-Key": key } : {}),
      ...(init.headers ?? {}),
    },
  });
  const text = response.status === 204 ? "" : await response.text();
  if (!response.ok) {
    const detail = text && text.length < 500 ? `: ${text}` : "";
    throw new Error(`Zotero local API returned HTTP ${response.status}${detail}`);
  }
  if (!text) return null;
  const type = response.headers.get("content-type") ?? "";
  return type.includes("application/json") ? JSON.parse(text) : text;
}

async function currentStatus(lastError = null) {
  const config = await configuration();
  let desktop = "unavailable";
  let localApi = "not-configured";
  let version = null;
  try {
    const ping = await fetch(connectorPingUrl, { signal: AbortSignal.timeout(2_000) });
    if (ping.ok) {
      desktop = "available";
      version = ping.headers.get("x-zotero-version");
    }
  } catch {}
  if (config?.userId) {
    try {
      await api(`/users/${encodeURIComponent(String(config.userId))}/items?limit=1`);
      localApi = (await localApiKey()) ? "authorized" : "read-only";
    } catch (error) {
      localApi = error instanceof Error && /HTTP 403/.test(error.message) ? "disabled" : "unavailable";
    }
  }
  const state = !config ? "setup-required" : localApi === "authorized" ? "ready" : "authorization-required";
  const value = {
    state,
    desktop,
    version,
    localApi,
    storageMode: config?.storageMode ?? null,
    lastError,
  };
  await atomicJson(statusPath, value, 0o644);
  return value;
}

async function configure(input) {
  const userId = typeof input.userId === "number" ? String(input.userId) : input.userId?.trim();
  const storageMode = input.storageMode?.trim();
  if (!/^\d+$/.test(userId ?? "")) throw new Error("Zotero user ID must contain only digits");
  if (!storageModes.has(storageMode)) throw new Error("Storage mode must be zotero-storage, webdav, linked-folder, or server-only");
  await atomicJson(configurationPath, { userId, storageMode });
  return currentStatus();
}

async function authorize() {
  const config = await configuration();
  if (!config?.userId) throw new Error("Configure the Zotero user ID before authorizing writes");
  const serverId = await ensureRandomFile(serverIdPath, 16);
  const response = await fetch(`${zoteroBaseUrl}/local/authorize`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Zotero-Server-ID": serverId,
    },
    body: JSON.stringify({ appName: "ScholarServer" }),
    signal: AbortSignal.timeout(240_000),
  });
  const text = await response.text();
  let result;
  try { result = text ? JSON.parse(text) : {}; }
  catch { throw new Error(`Zotero returned an invalid authorization response (HTTP ${response.status})`); }
  if (!response.ok || result.denied || typeof result.key !== "string") {
    throw new Error(result.denied ? "Zotero authorization was denied" : `Zotero authorization failed (HTTP ${response.status})`);
  }
  await atomicWrite(localApiKeyPath, `${result.key}\n`, 0o600);
  await api(`/users/${encodeURIComponent(String(config.userId))}/items?limit=1`);
  return currentStatus();
}

async function sha256(filePath) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest("hex");
}

async function allowedAttachmentPath(candidate) {
  const resolved = await realpath(candidate);
  const roots = [];
  for (const root of ["/data", "/linked"]) {
    try { roots.push(await realpath(root)); } catch {}
  }
  if (!roots.some((root) => resolved === root || resolved.startsWith(`${root}${path.sep}`))) {
    throw new Error("Zotero returned an attachment outside the configured storage roots");
  }
  if (!(await lstat(resolved)).isFile()) throw new Error("The resolved attachment is not a regular file");
  return resolved;
}

async function resolveAttachment(input) {
  const attachmentKey = input.attachmentKey?.trim();
  if (!/^[A-Z0-9]{8}$/.test(attachmentKey ?? "")) throw new Error("Attachment key must be eight uppercase letters or digits");
  const config = await configuration();
  if (!config?.userId) throw new Error("Zotero is not configured");
  const prefix = `/users/${encodeURIComponent(String(config.userId))}/items/${attachmentKey}`;
  const attachment = await api(prefix);
  if (attachment?.data?.itemType !== "attachment") throw new Error("The requested Zotero item is not an attachment");
  const fileUrl = await api(`${prefix}/file/view/url`);
  if (typeof fileUrl !== "string" || !fileUrl.startsWith("file:")) throw new Error("Zotero did not return a local file for this attachment");
  const resolved = await allowedAttachmentPath(fileURLToPath(fileUrl.trim()));
  const metadata = await stat(resolved);
  return {
    state: "available",
    attachmentKey,
    filename: path.basename(resolved),
    contentType: attachment.data.contentType ?? null,
    linkMode: attachment.data.linkMode ?? null,
    bytes: metadata.size,
    sha256: await sha256(resolved),
  };
}

async function action(request) {
  switch (request.action) {
    case "status": return currentStatus();
    case "configure": return configure(request.input ?? {});
    case "authorize-local": return authorize();
    case "resolve-attachment": return resolveAttachment(request.input ?? {});
    default: throw new Error("Unsupported Zotero action");
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
    const message = error instanceof Error ? error.message : "Zotero action failed";
    await currentStatus(message);
    response = { ok: false, error: message };
  } finally {
    await rm(requestFile, { force: true });
  }
  await atomicJson(responseFile, response);
}

await mkdir(requestsPath, { recursive: true });
await mkdir(responsesPath, { recursive: true });
await ensureRandomFile(serviceTokenPath);
await ensureRandomFile(serverIdPath, 16);
await currentStatus();

for (;;) {
  const files = (await readdir(requestsPath)).filter((name) => /^[a-z0-9-]+\.json$/.test(name)).sort();
  for (const file of files) await processRequest(file);
  await new Promise((resolve) => setTimeout(resolve, 250));
}
