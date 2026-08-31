import { randomBytes } from "node:crypto";
import { encodeSettingsToSetupURI } from "@vrtmrz/livesync-commonlib/compat/API/processSetting";
import { upsertRemoteConfigurationInPlace } from "@vrtmrz/livesync-commonlib/remote-configurations";
import { createNewVaultSettings, PREFERRED_SETTING_SELF_HOSTED } from "@vrtmrz/livesync-commonlib/settings";

const DEFAULT_ORIGINS = "app://obsidian.md,capacitor://localhost,http://localhost";

export function generateSecret(bytes = 24) {
  return randomBytes(bytes).toString("base64url");
}

export function normalizeCouchDbUrl(value) {
  const parsed = new URL(String(value ?? "").trim());
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("The LiveSync address must begin with https://");
  }
  parsed.pathname = parsed.pathname.replace(/\/+$/, "");
  parsed.search = "";
  parsed.hash = "";
  return parsed.href.replace(/\/$/, "");
}

export function validateDatabaseName(value) {
  const database = String(value ?? "").trim();
  if (!/^[a-z][a-z0-9_$()+-]*$/.test(database)) {
    throw new Error("The vault database name is invalid");
  }
  return database;
}

export function validateCouchDbUsername(value) {
  const username = String(value ?? "").trim();
  if (!/^[a-z][a-z0-9-]{2,62}$/.test(username)) {
    throw new Error("The LiveSync account name is invalid");
  }
  return username;
}

function basicAuthorization(username, password) {
  return `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
}

async function couchRequest(label, url, init, accept = (response) => response.ok) {
  let lastError;
  for (let attempt = 1; attempt <= 24; attempt += 1) {
    try {
      const response = await fetch(url, { ...init, signal: AbortSignal.timeout(10_000) });
      const text = await response.text();
      if (accept(response, text)) return text;
      lastError = new Error(`${label} failed (HTTP ${response.status})`);
      if (response.status < 500) throw lastError;
    } catch (error) {
      lastError = error;
      if (error instanceof Error && /HTTP 4\d\d/.test(error.message)) throw error;
    }
    if (attempt < 24) await new Promise((resolve) => setTimeout(resolve, 2_500));
  }
  throw lastError instanceof Error ? lastError : new Error(`${label} failed`);
}

export async function initializeCouchDb({ internalUrl, username, password }) {
  const base = normalizeCouchDbUrl(internalUrl);
  const headers = {
    Authorization: basicAuthorization(username, password),
    "Content-Type": "application/json"
  };
  await couchRequest("CouchDB startup", `${base}/_up`, { method: "GET", headers });
  await couchRequest("single-node setup", `${base}/_cluster_setup`, {
    method: "POST",
    headers,
    body: JSON.stringify({ action: "enable_single_node", username, password, bind_address: "0.0.0.0", port: 5984, singlenode: true })
  }, (response, text) => response.ok || ([400, 409].includes(response.status) && /already|finished/i.test(text)));
  const settings = [
    ["chttpd/require_valid_user", '"true"'],
    ["chttpd_auth/require_valid_user", '"true"'],
    ["httpd/WWW-Authenticate", '"Basic realm=\\"couchdb\\""'],
    ["httpd/enable_cors", '"true"'],
    ["chttpd/enable_cors", '"true"'],
    ["chttpd/max_http_request_size", '"4294967296"'],
    ["couchdb/max_document_size", '"50000000"'],
    ["cors/credentials", '"true"'],
    ["cors/origins", JSON.stringify(DEFAULT_ORIGINS)]
  ];
  for (const [key, body] of settings) {
    await couchRequest("CouchDB configuration", `${base}/_node/_local/_config/${key}`, { method: "PUT", headers, body });
  }
  for (const database of ["_users", "_replicator", "_global_changes"]) {
    await couchRequest("CouchDB system database creation", `${base}/${database}`, { method: "PUT", headers }, (response) => response.ok || response.status === 412);
  }
}

export async function provisionCouchDb({ internalUrl, username, password, database, clientUsername, clientPassword }) {
  const base = normalizeCouchDbUrl(internalUrl);
  const db = validateDatabaseName(database);
  const client = validateCouchDbUsername(clientUsername);
  if (typeof clientPassword !== "string" || clientPassword.length < 32) {
    throw new Error("The LiveSync account password is invalid");
  }
  await initializeCouchDb({ internalUrl: base, username, password });
  const headers = {
    Authorization: basicAuthorization(username, password),
    "Content-Type": "application/json"
  };
  const userId = `org.couchdb.user:${client}`;
  await couchRequest("vault account creation", `${base}/_users/${encodeURIComponent(userId)}`, {
    method: "PUT",
    headers,
    body: JSON.stringify({ _id: userId, name: client, roles: [], type: "user", password: clientPassword })
  }, (response) => response.ok || response.status === 409);
  await couchRequest("vault database creation", `${base}/${encodeURIComponent(db)}`, { method: "PUT", headers }, (response) => response.ok || response.status === 412);
  await couchRequest("vault database permissions", `${base}/${encodeURIComponent(db)}/_security`, {
    method: "PUT",
    headers,
    body: JSON.stringify({
      admins: { names: [], roles: [] },
      members: { names: [client], roles: [] }
    })
  });
  await couchRequest("vault account verification", `${base}/${encodeURIComponent(db)}`, {
    method: "GET",
    headers: { Authorization: basicAuthorization(client, clientPassword) }
  });
}

export function createScholarServerLiveSyncSettings({ url, username, password, database, vaultPassphrase, requestApi = false }) {
  const settings = createNewVaultSettings();
  Object.assign(settings, PREFERRED_SETTING_SELF_HOSTED, {
    couchDB_URI: normalizeCouchDbUrl(url),
    couchDB_USER: username,
    couchDB_PASSWORD: password,
    couchDB_DBNAME: validateDatabaseName(database),
    batchSave: true,
    liveSync: true,
    periodicReplication: true,
    syncOnSave: true,
    syncOnEditorSave: true,
    syncOnStart: true,
    syncOnFileOpen: true,
    syncAfterMerge: true,
    keepReplicationActiveInBackground: true,
    isConfigured: true,
    encrypt: true,
    passphrase: vaultPassphrase,
    usePathObfuscation: true,
    useRequestAPI: requestApi
  });
  upsertRemoteConfigurationInPlace(settings, "couchdb", { activate: true });
  return settings;
}

export async function generateSetupUri({ url, username, password, database, vaultPassphrase, requestApi = false, setupPassphrase = generateSecret() }) {
  const settings = createScholarServerLiveSyncSettings({ url, username, password, database, vaultPassphrase, requestApi });
  const setupURI = await encodeSettingsToSetupURI(settings, setupPassphrase, [
    "pluginSyncExtendedSetting",
    "doNotUseFixedRevisionForChunks"
  ], true);
  return { setupURI: setupURI.trim(), setupPassphrase };
}
