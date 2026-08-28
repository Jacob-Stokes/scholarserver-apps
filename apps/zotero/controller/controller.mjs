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
const accountSessionPath = path.join(runtimePath, "account-session.json");
const bridgePath = path.join(runtimePath, "zotero-bridge");
const bridgeRequestsPath = path.join(bridgePath, "requests");
const bridgeResponsesPath = path.join(bridgePath, "responses");
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

async function callBridge(action, input = {}, timeoutMs = 30_000) {
  await mkdir(bridgeRequestsPath, { recursive: true });
  await mkdir(bridgeResponsesPath, { recursive: true });
  const id = randomUUID().toLowerCase();
  const requestPath = path.join(bridgeRequestsPath, `${id}.json`);
  const responsePath = path.join(bridgeResponsesPath, `${id}.json`);
  await atomicJson(requestPath, { action, input });
  const deadline = Date.now() + timeoutMs;
  try {
    while (Date.now() < deadline) {
      try {
        const response = JSON.parse(await readFile(responsePath, "utf8"));
        if (!response.ok) throw new Error(response.error || "Zotero setup bridge rejected the request");
        return response.result;
      } catch (error) {
        if (error instanceof SyntaxError) throw new Error("Zotero setup bridge returned invalid JSON");
        if (error?.code !== "ENOENT") throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    throw new Error("Zotero setup bridge did not respond before the deadline");
  } finally {
    await rm(requestPath, { force: true });
    await rm(responsePath, { force: true });
  }
}

async function updateConfiguration(values) {
  const current = await configuration() ?? {};
  const next = { ...current, ...values };
  await atomicJson(configurationPath, next);
  return next;
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
  let engine = null;
  try {
    const ping = await fetch(connectorPingUrl, { signal: AbortSignal.timeout(2_000) });
    if (ping.ok) {
      desktop = "available";
      version = ping.headers.get("x-zotero-version");
    }
  } catch {}
  if (desktop === "available") {
    try { engine = await callBridge("status", {}, 2_000); }
    catch {}
  }
  if (config?.userId) {
    try {
      await api(`/users/${encodeURIComponent(String(config.userId))}/items?limit=1`);
      localApi = (await localApiKey()) ? "authorized" : "read-only";
    } catch (error) {
      localApi = error instanceof Error && /HTTP 403/.test(error.message) ? "disabled" : "unavailable";
    }
  }
  let state = "setup-required";
  if (desktop === "available" && engine && !engine.accountConnected) state = "account-required";
  else if (desktop === "available" && engine?.accountConnected && !config?.storageMode) state = "storage-required";
  else if (config?.storageMode && localApi === "authorized") state = "ready";
  else if (config?.storageMode) state = "authorization-required";
  const value = {
    state,
    desktop,
    version,
    localApi,
    storageMode: config?.storageMode ?? null,
    accountConnected: engine?.accountConnected ?? false,
    userId: config?.userId ?? engine?.userId ?? null,
    username: engine?.username ?? null,
    downloadMode: engine?.downloadMode ?? null,
    groupFileSync: engine?.groupFileSync ?? false,
    storageVerified: engine?.storageVerified ?? false,
    syncInProgress: engine?.syncInProgress ?? false,
    lastError,
  };
  await atomicJson(statusPath, value, 0o644);
  return value;
}

async function startAccountLink() {
  const result = await callBridge("account-start");
  await atomicJson(accountSessionPath, { sessionToken: result.sessionToken });
  return { state: "account-authorization-required", loginUrl: result.loginUrl };
}

async function completeAccountLink() {
  let session;
  try { session = JSON.parse(await readFile(accountSessionPath, "utf8")); }
  catch { throw new Error("Start Zotero account linking before checking its progress"); }
  const result = await callBridge("account-complete", { sessionToken: session.sessionToken });
  if (result.state === "pending") return { state: "account-authorization-pending" };
  if (result.state === "cancelled") {
    await rm(accountSessionPath, { force: true });
    return { state: "account-required" };
  }
  if (result.state !== "connected" || !/^\d+$/.test(String(result.userId ?? ""))) {
    throw new Error("Zotero account linking completed without a valid user ID");
  }
  await updateConfiguration({ userId: String(result.userId) });
  await rm(accountSessionPath, { force: true });
  return currentStatus();
}

async function configureStorage(input) {
  const storageMode = input.storageMode?.trim();
  const downloadMode = input.downloadMode?.trim() || "on-demand";
  if (!storageModes.has(storageMode)) throw new Error("Storage mode must be zotero-storage, webdav, linked-folder, or server-only");
  if (!new Set(["on-sync", "on-demand"]).has(downloadMode)) throw new Error("Download mode must be on-sync or on-demand");
  const groupFileSync = typeof input.groupFileSync === "boolean" ? input.groupFileSync : storageMode === "zotero-storage";
  await callBridge("configure-storage", { storageMode, downloadMode, groupFileSync });
  const engine = await callBridge("status");
  await updateConfiguration({
    storageMode,
    ...(engine?.userId ? { userId: String(engine.userId) } : {}),
  });
  return currentStatus();
}

async function configureWebDAV(input) {
  const url = typeof input.url === "string" ? input.url.trim() : "";
  const username = typeof input.username === "string" ? input.username.trim() : "";
  const password = typeof input.password === "string" ? input.password : "";
  const downloadMode = input.downloadMode?.trim() || "on-demand";
  const groupFileSync = input.groupFileSync === true;
  if (!url || !username || !password) throw new Error("WebDAV URL, username, and password are required");
  await callBridge("configure-webdav", { url, username, password, downloadMode, groupFileSync }, 120_000);
  const engine = await callBridge("status");
  await updateConfiguration({
    storageMode: "webdav",
    ...(engine?.userId ? { userId: String(engine.userId) } : {}),
  });
  return currentStatus();
}

async function syncNow() {
  await callBridge("sync-now", {}, 15 * 60_000);
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
    case "account-start": return startAccountLink();
    case "account-complete": return completeAccountLink();
    case "configure-storage": return configureStorage(request.input ?? {});
    case "configure-webdav": return configureWebDAV(request.input ?? {});
    case "sync-now": return syncNow();
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
    await rm(requestFile, { force: true });
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
