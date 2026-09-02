import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { lstat, mkdir, open, readdir, readFile, realpath, rename, rm, stat, writeFile } from "node:fs/promises";
import { createServer, request as nodeHttpRequest } from "node:http";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

const runtimePath = "/runtime";
const requestsPath = path.join(runtimePath, "requests");
const responsesPath = path.join(runtimePath, "responses");
const statusPath = path.join(runtimePath, "status.json");
const serviceTokenPath = path.join(runtimePath, "service-token");
const configurationPath = path.join(runtimePath, "configuration.json");
const localApiKeyPath = path.join(runtimePath, "local-api-key");
const localApiBridgeTokenPath = path.join(runtimePath, "local-api-bridge-token");
const webApiKeyPath = path.join(runtimePath, "web-api-key");
const accountSessionPath = path.join(runtimePath, "account-session.json");
const bridgePath = path.join(runtimePath, "zotero-bridge");
const bridgeRequestsPath = path.join(bridgePath, "requests");
const bridgeResponsesPath = path.join(bridgePath, "responses");
const variant = process.env.SCHOLARSERVER_VARIANT ?? "complete-workspace";
const onlineLibrary = variant === "online-library";
const zoteroBaseUrl = process.env.ZOTERO_LOCAL_BASE_URL ?? "http://desktop:8082/api";
const connectorPingUrl = process.env.ZOTERO_CONNECTOR_PING_URL ?? "http://desktop:8082/connector/ping";
const automationsBaseUrl = process.env.ZOTERO_AUTOMATIONS_URL ?? "http://automations:8081/v1";
const zoteroWebApiUrl = "https://api.zotero.org";
const uiPath = "/app/ui";
const storageModes = new Set(["zotero-storage", "webdav", "linked-folder", "server-only"]);
const onlineStorageModes = new Set(["metadata-only", "zotero-storage"]);
const desktopAccessModes = new Set(["tailscale", "cloudflare", "caddy", "external-proxy"]);
let attachmentIndexCache = { expiresAt: 0, items: [] };
let onlineAccountCache = { expiresAt: 0, value: null };

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
  try {
    return JSON.parse(await readFile(configurationPath, "utf8"));
  } catch {
    return null;
  }
}

async function localApiKey() {
  try {
    return (await readFile(localApiKeyPath, "utf8")).trim();
  } catch {
    return "";
  }
}

async function localApiBridgeToken() {
  try {
    return (await readFile(localApiBridgeTokenPath, "utf8")).trim();
  } catch {
    return "";
  }
}

async function webApiKey() {
  try {
    return (await readFile(webApiKeyPath, "utf8")).trim();
  } catch {
    return "";
  }
}

async function onlineApi(pathname, init = {}) {
  const key = await webApiKey();
  if (!key) throw new Error("Connect a Zotero online library first");
  const response = await fetch(`${zoteroWebApiUrl}${pathname}`, {
    ...init,
    headers: {
      Accept: "application/json",
      "Zotero-API-Version": "3",
      "Zotero-API-Key": key,
      ...(init.headers ?? {})
    },
    signal: init.signal ?? AbortSignal.timeout(30_000)
  });
  const text = response.status === 204 ? "" : await response.text();
  if (!response.ok) {
    const detail = text && text.length < 500 ? `: ${text}` : "";
    throw new Error(`Zotero Web API returned HTTP ${response.status}${detail}`);
  }
  if (!text) return null;
  const type = response.headers.get("content-type") ?? "";
  return type.includes("application/json") ? JSON.parse(text) : text;
}

async function inspectOnlineAccount(force = false) {
  if (!force && onlineAccountCache.expiresAt > Date.now()) return onlineAccountCache.value;
  const key = await webApiKey();
  if (!key) return null;
  const result = await onlineApi(`/keys/${encodeURIComponent(key)}`);
  const userId = String(result?.userID ?? result?.userId ?? "");
  if (!/^\d+$/.test(userId)) throw new Error("Zotero did not return a valid user ID for this key");
  const access = result?.access ?? {};
  const userAccess = access?.user ?? {};
  const value = {
    userId,
    username: typeof result?.username === "string" ? result.username : null,
    permissions: {
      library: userAccess.library === true,
      notes: userAccess.notes === true,
      write: userAccess.write === true,
      groups: access?.groups ? "configured" : "none"
    }
  };
  onlineAccountCache = { expiresAt: Date.now() + 60_000, value };
  return value;
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
  const current = (await configuration()) ?? {};
  const next = { ...current, ...values };
  await atomicJson(configurationPath, next);
  return next;
}

async function api(pathname, init = {}) {
  const key = await localApiKey();
  const bridgeToken = await localApiBridgeToken();
  const method = (init.method ?? "GET").toUpperCase();
  const serverId = method === "GET" || method === "HEAD" ? null : await discoverServerId();
  const response = await fetch(`${zoteroBaseUrl}${pathname}`, {
    ...init,
    headers: {
      Accept: "application/json",
      "Zotero-API-Version": "3",
      ...(key ? { "Zotero-API-Key": key } : {}),
      ...(bridgeToken ? { "X-ScholarServer-Bridge": bridgeToken } : {}),
      ...(serverId ? { "Zotero-Server-ID": serverId } : {}),
      ...(init.headers ?? {})
    }
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

async function discoverServerId() {
  const bridgeToken = await localApiBridgeToken();
  const response = await fetch(`${zoteroBaseUrl}/`, {
    headers: {
      Accept: "application/json",
      "Zotero-API-Version": "3",
      ...(bridgeToken ? { "X-ScholarServer-Bridge": bridgeToken } : {})
    },
    signal: AbortSignal.timeout(5_000)
  });
  if (!response.ok) throw new Error(`Could not identify the running Zotero desktop (HTTP ${response.status})`);
  const serverId = response.headers.get("zotero-server-id")?.trim() ?? "";
  if (!serverId || serverId.length > 128 || /[\x00-\x20\x7f]/.test(serverId)) {
    throw new Error("The running Zotero desktop did not provide a valid server ID");
  }
  return serverId;
}

async function currentStatus(lastError = null) {
  const config = await configuration();
  if (onlineLibrary) {
    let account = null;
    let accountError = null;
    try {
      account = await inspectOnlineAccount();
    } catch (error) {
      accountError = error instanceof Error ? error.message : "Could not reach Zotero";
    }
    const storageMode =
      config?.mode === "online-library" && onlineStorageModes.has(config?.storageMode) ? config.storageMode : null;
    const state = !account ? "account-required" : !storageMode ? "storage-required" : "ready";
    const value = {
      state,
      variant,
      connectionMode: "online-library",
      desktop: "not-installed",
      version: null,
      localApi: "not-applicable",
      storageMode,
      desktopAccess: null,
      accountConnected: Boolean(account),
      userId: account?.userId ?? (config?.mode === "online-library" ? config?.userId : null) ?? null,
      username: account?.username ?? (config?.mode === "online-library" ? config?.username : null) ?? null,
      permissions: account?.permissions ?? null,
      downloadMode: storageMode === "zotero-storage" ? "on-demand" : null,
      groupFileSync: false,
      linkedFolder: null,
      linkedFolderAutomation: false,
      storageVerified: Boolean(storageMode),
      syncInProgress: false,
      features: { desktop: false, automations: false, localAttachments: false },
      lastError: lastError ?? accountError
    };
    await atomicJson(statusPath, value, 0o644);
    return value;
  }
  let desktop = "unavailable";
  let localApi = "not-configured";
  let version = null;
  let engine = null;
  try {
    const bridgeToken = await localApiBridgeToken();
    const ping = await fetch(connectorPingUrl, {
      headers: bridgeToken ? { "X-ScholarServer-Bridge": bridgeToken } : {},
      signal: AbortSignal.timeout(2_000)
    });
    if (ping.ok) {
      desktop = "available";
      version = ping.headers.get("x-zotero-version");
    }
  } catch {}
  if (desktop === "available") {
    try {
      engine = await callBridge("status", {}, 2_000);
    } catch {}
  }
  if (config?.userId) {
    try {
      await api(`/users/${encodeURIComponent(String(config.userId))}/items?limit=1`);
      localApi = (await localApiKey()) ? "authorized" : "read-only";
    } catch (error) {
      localApi = error instanceof Error && /HTTP 403/.test(error.message) ? "disabled" : "unavailable";
    }
  }
  const storageMode = storageModes.has(config?.storageMode) ? config.storageMode : null;
  const desktopAccess =
    config?.desktopAccess &&
    desktopAccessModes.has(config.desktopAccess.transport) &&
    typeof config.desktopAccess.optionId === "string" &&
    typeof config.desktopAccess.url === "string"
      ? config.desktopAccess
      : null;
  let state = "setup-required";
  if (desktop === "available" && engine && !engine.accountConnected) state = "account-required";
  else if (desktop === "available" && engine?.accountConnected && !storageMode) state = "storage-required";
  else if (storageMode && !desktopAccess) state = "desktop-access-required";
  else if (storageMode && localApi === "authorized") state = "ready";
  else if (storageMode) state = "authorization-required";
  const value = {
    state,
    variant,
    connectionMode: "complete-workspace",
    desktop,
    version,
    localApi,
    storageMode,
    desktopAccess,
    accountConnected: engine?.accountConnected ?? false,
    userId: config?.userId ?? engine?.userId ?? null,
    username: engine?.username ?? null,
    downloadMode: engine?.downloadMode ?? null,
    groupFileSync: engine?.groupFileSync ?? false,
    linkedFolder: engine?.linkedFolder ?? null,
    linkedFolderAutomation: engine?.linkedFolderAutomation ?? false,
    storageVerified: engine?.storageVerified ?? false,
    syncInProgress: engine?.syncInProgress ?? false,
    permissions: null,
    features: { desktop: true, automations: true, localAttachments: true },
    lastError
  };
  await atomicJson(statusPath, value, 0o644);
  return value;
}

async function configureDesktopAccess(input) {
  if (onlineLibrary) throw new Error("Online library only does not include Zotero Desktop");
  const optionId = typeof input.optionId === "string" ? input.optionId.trim() : "";
  const transport = typeof input.transport === "string" ? input.transport.trim() : "";
  const rawUrl = typeof input.url === "string" ? input.url.trim() : "";
  if (!/^[a-z][a-z0-9-]{0,62}$/.test(optionId) || !desktopAccessModes.has(transport)) {
    throw new Error("Choose one of the desktop connections offered by ScholarServer");
  }
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error("ScholarServer returned an invalid desktop address");
  }
  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash ||
    !/^\/apps\/[a-z][a-z0-9-]{0,62}\/endpoints\/desktop\/$/.test(parsed.pathname)
  ) {
    throw new Error("ScholarServer returned an unsafe desktop address");
  }
  await updateConfiguration({
    desktopAccess: { optionId, transport, url: parsed.toString() }
  });
  return currentStatus();
}

async function healthStatus() {
  if (onlineLibrary) return { status: "ok", mode: "online-library" };
  const engine = await callBridge("status", {}, 2_000);
  if (!engine || typeof engine.accountConnected !== "boolean") {
    throw new Error("The Zotero setup bridge is unavailable");
  }
  return { status: "ok" };
}

async function connectOnlineLibrary(input) {
  if (!onlineLibrary) throw new Error("This Zotero setup uses the private desktop connection");
  const apiKey = typeof input.apiKey === "string" ? input.apiKey.trim() : "";
  if (!/^[A-Za-z0-9]{16,128}$/.test(apiKey))
    throw new Error("Enter the API key created in your Zotero account settings");
  await atomicWrite(webApiKeyPath, `${apiKey}\n`, 0o600);
  onlineAccountCache = { expiresAt: 0, value: null };
  try {
    const account = await inspectOnlineAccount(true);
    if (!account?.permissions.library) throw new Error("This Zotero key does not allow library access");
    await updateConfiguration({
      mode: "online-library",
      userId: account.userId,
      username: account.username
    });
    return currentStatus();
  } catch (error) {
    await rm(webApiKeyPath, { force: true });
    onlineAccountCache = { expiresAt: 0, value: null };
    throw error;
  }
}

async function configureOnlineStorage(input) {
  if (!onlineLibrary) throw new Error("This Zotero setup uses Zotero Desktop for attachment storage");
  const storageMode = typeof input.storageMode === "string" ? input.storageMode.trim() : "";
  if (!onlineStorageModes.has(storageMode))
    throw new Error("Choose citation data only or Zotero Storage files on demand");
  const account = await inspectOnlineAccount();
  if (!account) throw new Error("Connect a Zotero online library first");
  await updateConfiguration({ storageMode });
  return currentStatus();
}

async function startAccountLink() {
  if (onlineLibrary) throw new Error("Use the Zotero online-library connection for this setup");
  const result = await callBridge("account-start");
  await atomicJson(accountSessionPath, { sessionToken: result.sessionToken });
  return { state: "account-authorization-required", loginUrl: result.loginUrl };
}

async function completeAccountLink() {
  let session;
  try {
    session = JSON.parse(await readFile(accountSessionPath, "utf8"));
  } catch {
    throw new Error("Start Zotero account linking before checking its progress");
  }
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
  if (onlineLibrary) return configureOnlineStorage(input);
  const storageMode = input.storageMode?.trim();
  const downloadMode = input.downloadMode?.trim() || "on-demand";
  if (!storageModes.has(storageMode))
    throw new Error("Storage mode must be zotero-storage, webdav, linked-folder, or server-only");
  if (!new Set(["on-sync", "on-demand"]).has(downloadMode))
    throw new Error("Download mode must be on-sync or on-demand");
  const groupFileSync =
    typeof input.groupFileSync === "boolean" ? input.groupFileSync : storageMode === "zotero-storage";
  await callBridge("configure-storage", { storageMode, downloadMode, groupFileSync });
  const engine = await callBridge("status");
  await updateConfiguration({
    storageMode,
    ...(engine?.userId ? { userId: String(engine.userId) } : {})
  });
  return currentStatus();
}

async function configureWebDAV(input) {
  if (onlineLibrary) throw new Error("WebDAV requires the Complete Zotero workspace");
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
    ...(engine?.userId ? { userId: String(engine.userId) } : {})
  });
  return currentStatus();
}

async function syncNow() {
  if (onlineLibrary)
    throw new Error("The online library is already read directly from zotero.org and does not need a server sync");
  await callBridge("sync-now", {}, 15 * 60_000);
  return currentStatus();
}

async function attachDoclingResult(input) {
  if (onlineLibrary) throw new Error("Attaching Docling results in Online library only is not available yet");
  const sourceAttachmentKey =
    typeof input.sourceAttachmentKey === "string" ? input.sourceAttachmentKey.trim().toUpperCase() : "";
  const relativePath = typeof input.relativePath === "string" ? input.relativePath.trim() : "";
  if (!/^[A-Z0-9]{8}$/.test(sourceAttachmentKey)) throw new Error("A valid Zotero source attachment key is required");
  if (!/^\.scholarserver\/docling\/[a-f0-9]{64}\/document\.md$/.test(relativePath)) {
    throw new Error("The Docling result path is invalid");
  }
  return callBridge("attach-docling-result", { sourceAttachmentKey, relativePath }, 120_000);
}

async function authorize() {
  if (onlineLibrary) throw new Error("Online library only does not use Zotero Desktop authorization");
  const config = await configuration();
  if (!config?.userId) throw new Error("Configure the Zotero user ID before authorizing writes");
  const serverId = await discoverServerId();
  const bridgeToken = await localApiBridgeToken();
  const response = await fetch(`${zoteroBaseUrl}/local/authorize`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "Zotero-API-Version": "3",
      "Zotero-Server-ID": serverId,
      ...(bridgeToken ? { "X-ScholarServer-Bridge": bridgeToken } : {})
    },
    body: JSON.stringify({ appName: "ScholarServer" }),
    signal: AbortSignal.timeout(240_000)
  });
  const text = await response.text();
  if (response.status === 412) {
    throw new Error("Zotero restarted while authorization was beginning. Select Authorize ScholarServer again");
  }
  let result;
  try {
    result = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`Zotero returned an invalid authorization response (HTTP ${response.status})`);
  }
  if (!response.ok || result.denied || typeof result.key !== "string") {
    throw new Error(
      result.denied ? "Zotero authorization was denied" : `Zotero authorization failed (HTTP ${response.status})`
    );
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
  const desktopDataRoot = "/config/home/Zotero";
  const controllerDataRoot = "/data";
  const translated =
    candidate === desktopDataRoot
      ? controllerDataRoot
      : candidate.startsWith(`${desktopDataRoot}${path.sep}`)
        ? path.join(controllerDataRoot, candidate.slice(desktopDataRoot.length + 1))
        : candidate;
  const resolved = await realpath(translated);
  const roots = [];
  for (const root of ["/data", "/linked"]) {
    try {
      roots.push(await realpath(root));
    } catch {}
  }
  if (!roots.some((root) => resolved === root || resolved.startsWith(`${root}${path.sep}`))) {
    throw new Error("Zotero returned an attachment outside the configured storage roots");
  }
  if (!(await lstat(resolved)).isFile()) throw new Error("The resolved attachment is not a regular file");
  return resolved;
}

async function resolveAttachment(input) {
  const attachmentKey = input.attachmentKey?.trim();
  if (!/^[A-Z0-9]{8}$/.test(attachmentKey ?? ""))
    throw new Error("Attachment key must be eight uppercase letters or digits");
  const config = await configuration();
  if (!config?.userId) throw new Error("Zotero is not configured");
  if (onlineLibrary) {
    const prefix = `/users/${encodeURIComponent(String(config.userId))}/items/${attachmentKey}`;
    const attachment = await onlineApi(prefix);
    if (attachment?.data?.itemType !== "attachment") throw new Error("The requested Zotero item is not an attachment");
    const common = {
      attachmentKey,
      filename: attachment.data.filename ?? attachment.data.title ?? null,
      contentType: attachment.data.contentType ?? null,
      linkMode: attachment.data.linkMode ?? null
    };
    if (config.storageMode !== "zotero-storage") return { state: "metadata-only", ...common };
    if (attachment.data.linkMode === "linked_file") {
      return { state: "unavailable", reason: "linked-file", ...common };
    }
    const key = await webApiKey();
    const response = await fetch(`${zoteroWebApiUrl}${prefix}/file`, {
      headers: { "Zotero-API-Key": key, "Zotero-API-Version": "3" },
      redirect: "follow",
      signal: AbortSignal.timeout(120_000)
    });
    if (!response.ok || !response.body) {
      const reason =
        response.status === 404
          ? "The file is not available from Zotero Storage; it may use WebDAV"
          : `HTTP ${response.status}`;
      throw new Error(`Zotero could not provide this attachment: ${reason}`);
    }
    const declared = Number(response.headers.get("content-length") ?? 0);
    if (Number.isFinite(declared) && declared > 1024 * 1024 * 1024)
      throw new Error("This attachment exceeds the 1 GiB safety limit");
    const safeName =
      String(common.filename ?? `${attachmentKey}.bin`)
        .replace(/[^A-Za-z0-9._ -]/g, "_")
        .slice(0, 180) || `${attachmentKey}.bin`;
    const directory = path.join("/cache", "attachments", attachmentKey);
    const destination = path.join(directory, safeName);
    await mkdir(directory, { recursive: true });
    const temporary = `${destination}.${process.pid}.tmp`;
    try {
      await pipeline(Readable.fromWeb(response.body), createWriteStream(temporary, { mode: 0o600 }));
      await rename(temporary, destination);
    } finally {
      await rm(temporary, { force: true });
    }
    const metadata = await stat(destination);
    return { state: "available", ...common, bytes: metadata.size, sha256: await sha256(destination), cached: true };
  }
  const prefix = `/users/${encodeURIComponent(String(config.userId))}/items/${attachmentKey}`;
  const attachment = await api(prefix);
  if (attachment?.data?.itemType !== "attachment") throw new Error("The requested Zotero item is not an attachment");
  const fileUrl = await api(`${prefix}/file/view/url`);
  if (typeof fileUrl !== "string" || !fileUrl.startsWith("file:"))
    throw new Error("Zotero did not return a local file for this attachment");
  const resolved = await allowedAttachmentPath(fileURLToPath(fileUrl.trim()));
  const metadata = await stat(resolved);
  return {
    state: "available",
    attachmentKey,
    filename: path.basename(resolved),
    contentType: attachment.data.contentType ?? null,
    linkMode: attachment.data.linkMode ?? null,
    bytes: metadata.size,
    sha256: await sha256(resolved)
  };
}

async function personalAttachments(userId) {
  if (attachmentIndexCache.expiresAt > Date.now()) return attachmentIndexCache.items;
  const items = [];
  for (let start = 0; start < 1000; start += 100) {
    const page = await api(
      `/users/${encodeURIComponent(String(userId))}/items?itemType=attachment&limit=100&start=${start}&format=json`
    );
    if (!Array.isArray(page)) throw new Error("Zotero returned an invalid attachment list");
    items.push(...page);
    if (page.length < 100) break;
  }
  attachmentIndexCache = { expiresAt: Date.now() + 30_000, items };
  return items;
}

async function matchAttachment(input) {
  if (onlineLibrary) throw new Error("Shared linked-file matching requires the Complete Zotero workspace");
  const sourcePath = typeof input.sourcePath === "string" ? input.sourcePath.trim().replaceAll("\\", "/") : "";
  const relative = sourcePath ? sourcePath.split("/") : [];
  if (!sourcePath || sourcePath.startsWith("/") || relative.some((part) => !part || part === "." || part === "..")) {
    throw new Error("Enter a valid path inside the linked research files folder");
  }
  const linkedRoot = await realpath("/linked");
  const expected = await realpath(path.join(linkedRoot, ...relative));
  if (expected === linkedRoot || !expected.startsWith(`${linkedRoot}${path.sep}`)) {
    throw new Error("The selected file leaves the linked research files folder");
  }
  const config = await configuration();
  if (!config?.userId) throw new Error("Zotero is not configured");
  const wantedName = path.basename(expected).toLocaleLowerCase();
  const attachments = await personalAttachments(config.userId);
  const candidates = attachments.filter((item) => {
    const data = item?.data ?? {};
    const storedPath = String(data.path ?? "").replace(/^attachments:/, "");
    const filename = String(data.filename ?? path.basename(storedPath) ?? data.title ?? "");
    return filename.toLocaleLowerCase() === wantedName || String(data.title ?? "").toLocaleLowerCase() === wantedName;
  });
  const matches = [];
  for (const item of candidates) {
    const key = String(item?.key ?? item?.data?.key ?? "").toUpperCase();
    if (!/^[A-Z0-9]{8}$/.test(key)) continue;
    try {
      const prefix = `/users/${encodeURIComponent(String(config.userId))}/items/${key}`;
      const fileUrl = await api(`${prefix}/file/view/url`);
      if (typeof fileUrl !== "string" || !fileUrl.startsWith("file:")) continue;
      if ((await allowedAttachmentPath(fileURLToPath(fileUrl.trim()))) !== expected) continue;
      matches.push({
        attachmentKey: key,
        parentItemKey: item?.data?.parentItem ?? null,
        title: item?.data?.title ?? path.basename(expected)
      });
    } catch {}
  }
  if (matches.length === 1) return { state: "matched", sourcePath, ...matches[0] };
  if (matches.length > 1) return { state: "ambiguous", sourcePath, matches };
  return { state: "not-found", sourcePath, matches: [] };
}

async function action(request) {
  switch (request.action) {
    case "status":
      return currentStatus();
    case "account-start":
      return startAccountLink();
    case "account-complete":
      return completeAccountLink();
    case "connect-online-library":
      return connectOnlineLibrary(request.input ?? {});
    case "configure-storage":
      return configureStorage(request.input ?? {});
    case "configure-webdav":
      return configureWebDAV(request.input ?? {});
    case "configure-desktop-access":
      return configureDesktopAccess(request.input ?? {});
    case "sync-now":
      return syncNow();
    case "authorize-local":
      return authorize();
    case "resolve-attachment":
      return resolveAttachment(request.input ?? {});
    case "match-attachment":
      return matchAttachment(request.input ?? {});
    case "attach-docling-result":
      return attachDoclingResult(request.input ?? {});
    default:
      throw new Error("Unsupported Zotero action");
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

function headers(response, contentType = "application/json; charset=utf-8") {
  response.setHeader("Content-Type", contentType);
  response.setHeader("Cache-Control", "no-store");
  response.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'"
  );
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
}

function json(response, statusCode, value) {
  const output = Buffer.from(JSON.stringify(value));
  response.statusCode = statusCode;
  headers(response);
  response.setHeader("Content-Length", output.length);
  response.end(output);
}

async function body(request) {
  const declared = Number(request.headers["content-length"] ?? 0);
  if (!Number.isInteger(declared) || declared < 0 || declared > 1024 * 1024)
    throw new Error("Request body is too large");
  const chunks = [];
  let length = 0;
  for await (const chunk of request) {
    length += chunk.length;
    if (length > 1024 * 1024) throw new Error("Request body is too large");
    chunks.push(chunk);
  }
  const value = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  if (!value || Array.isArray(value) || typeof value !== "object") throw new Error("Request body must be an object");
  return value;
}

async function proxyAutomations(request, response, url) {
  if (onlineLibrary)
    return json(response, 404, {
      error: "Automations that require the Zotero desktop are not installed with Online library only"
    });
  const suffix = url.pathname.replace(/^\/api\/automations/, "");
  const target =
    suffix === "/folders"
      ? `${automationsBaseUrl}/folders${url.search}`
      : `${automationsBaseUrl}/automations${suffix}${url.search}`;
  const requestBody =
    request.method === "GET" || request.method === "HEAD" ? undefined : JSON.stringify(await body(request));
  const upstream = await fetch(target, {
    method: request.method,
    headers: requestBody ? { "content-type": "application/json" } : undefined,
    body: requestBody,
    signal: AbortSignal.timeout(130_000)
  });
  const value = await upstream
    .json()
    .catch(() => ({ error: "The Zotero automation worker returned an invalid response" }));
  return json(response, upstream.status, value);
}

const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".png", "image/png"],
  [".ico", "image/x-icon"]
]);

async function sendStatic(requestPath, response) {
  const root = path.resolve(uiPath);
  // Vite emits relative asset URLs so the same UI can run at / locally and
  // behind the Manager's /apps/:instance prefix. On a client-side detail
  // route those URLs include the route segments (for example
  // /automations/assets/app.js), so map every assets suffix back to the
  // immutable build directory before applying the normal traversal guard.
  const assetPosition = requestPath.indexOf("/assets/");
  const staticPath = assetPosition >= 0 ? requestPath.slice(assetPosition) : requestPath;
  let candidate = path.resolve(root, staticPath.replace(/^\/+/, ""));
  if (candidate !== root && !candidate.startsWith(`${root}${path.sep}`))
    return json(response, 404, { error: "Not found" });
  try {
    if (!(await stat(candidate)).isFile()) candidate = path.join(root, "index.html");
  } catch {
    candidate = path.join(root, "index.html");
  }
  try {
    const content = await readFile(candidate);
    response.statusCode = 200;
    headers(response, contentTypes.get(path.extname(candidate)) ?? "application/octet-stream");
    response.setHeader("Content-Length", content.length);
    response.end(content);
  } catch {
    json(response, 503, { error: "Zotero interface is unavailable" });
  }
}

async function handleHttp(request, response) {
  const url = new URL(request.url ?? "/", "http://localhost");
  try {
    if (request.method === "GET" && url.pathname === "/health") return json(response, 200, await healthStatus());
    if (request.method === "GET" && url.pathname === "/api/status") return json(response, 200, await currentStatus());
    if (request.method === "POST" && url.pathname === "/api/account/start")
      return json(response, 200, await startAccountLink());
    if (request.method === "POST" && url.pathname === "/api/account/complete")
      return json(response, 200, await completeAccountLink());
    if (request.method === "POST" && url.pathname === "/api/account/online")
      return json(response, 200, await connectOnlineLibrary(await body(request)));
    if (request.method === "POST" && url.pathname === "/api/storage")
      return json(response, 200, await configureStorage(await body(request)));
    if (request.method === "POST" && url.pathname === "/api/storage/webdav")
      return json(response, 200, await configureWebDAV(await body(request)));
    if (request.method === "POST" && url.pathname === "/api/desktop-access")
      return json(response, 200, await configureDesktopAccess(await body(request)));
    if (request.method === "POST" && url.pathname === "/api/authorize") {
      await body(request);
      return json(response, 200, await authorize());
    }
    if (request.method === "POST" && url.pathname === "/api/sync") {
      await body(request);
      return json(response, 200, await syncNow());
    }
    if (request.method === "POST" && url.pathname === "/api/attachments/resolve")
      return json(response, 200, await resolveAttachment(await body(request)));
    if (request.method === "POST" && url.pathname === "/api/attachments/match")
      return json(response, 200, await matchAttachment(await body(request)));
    if (request.method === "POST" && url.pathname === "/api/attachments/attach-docling")
      return json(response, 200, await attachDoclingResult(await body(request)));
    if (url.pathname === "/api/automations" || url.pathname.startsWith("/api/automations/"))
      return proxyAutomations(request, response, url);
    if (request.method === "GET" || request.method === "HEAD") return sendStatic(url.pathname, response);
    return json(response, 404, { error: "Not found" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Zotero request failed";
    await currentStatus(message);
    return json(response, 400, { error: message.slice(0, 1000) });
  }
}

const hopByHopHeaders = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade"
]);

function bridgeTokenMatches(candidate, expected) {
  const candidateBuffer = Buffer.from(candidate);
  const expectedBuffer = Buffer.from(expected);
  return candidateBuffer.length === expectedBuffer.length && timingSafeEqual(candidateBuffer, expectedBuffer);
}

async function handleLocalApiBridge(request, response) {
  const url = new URL(request.url ?? "/", "http://localhost");
  if (request.method === "GET" && url.pathname === "/health") {
    return json(response, 200, { status: "ok" });
  }
  if (!(url.pathname === "/api" || url.pathname.startsWith("/api/") || url.pathname === "/connector/ping")) {
    return json(response, 404, { error: "Not found" });
  }
  const expected = await localApiBridgeToken();
  const suppliedHeader = request.headers["x-scholarserver-bridge"];
  const supplied = Array.isArray(suppliedHeader) ? suppliedHeader[0] : (suppliedHeader ?? "");
  if (!expected || !bridgeTokenMatches(supplied, expected)) {
    return json(response, 401, { error: "Unauthorized" });
  }

  const upstreamHeaders = {};
  for (const [name, value] of Object.entries(request.headers)) {
    if (!hopByHopHeaders.has(name) && name !== "host" && name !== "x-scholarserver-bridge" && value !== undefined) {
      upstreamHeaders[name] = value;
    }
  }
  const upstreamRequest = nodeHttpRequest(
    {
      hostname: "127.0.0.1",
      port: 23119,
      path: `${url.pathname}${url.search}`,
      method: request.method,
      headers: upstreamHeaders
    },
    (upstreamResponse) => {
      response.statusCode = upstreamResponse.statusCode ?? 502;
      for (const [name, value] of Object.entries(upstreamResponse.headers)) {
        if (!hopByHopHeaders.has(name) && value !== undefined) response.setHeader(name, value);
      }
      response.setHeader("Cache-Control", "no-store");
      upstreamResponse.pipe(response);
    }
  );
  upstreamRequest.on("error", () => {
    if (!response.headersSent) json(response, 502, { error: "Zotero local API is unavailable" });
    else response.destroy();
  });
  request.on("aborted", () => upstreamRequest.destroy());
  request.pipe(upstreamRequest);
}

if (process.argv.includes("--local-api-bridge")) {
  await mkdir(runtimePath, { recursive: true });
  await ensureRandomFile(localApiBridgeTokenPath);
  createServer((request, response) => {
    void handleLocalApiBridge(request, response).catch(() => {
      if (!response.headersSent) json(response, 500, { error: "Local API bridge failed" });
      else response.destroy();
    });
  }).listen(8082, "0.0.0.0");
} else {
  await mkdir(requestsPath, { recursive: true });
  await mkdir(responsesPath, { recursive: true });
  await ensureRandomFile(serviceTokenPath);
  await currentStatus();
  createServer((request, response) => {
    void handleHttp(request, response);
  }).listen(8080, "0.0.0.0");

  for (;;) {
    const files = (await readdir(requestsPath)).filter((name) => /^[a-z0-9-]+\.json$/.test(name)).sort();
    for (const file of files) await processRequest(file);
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}
