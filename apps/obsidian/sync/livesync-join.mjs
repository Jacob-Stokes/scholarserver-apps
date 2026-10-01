import { isIP } from "node:net";
import {
  decodeSettingsFromSetupURI,
  encodeSettingsToSetupURI
} from "@vrtmrz/livesync-commonlib/compat/API/processSetting";
import { upsertRemoteConfigurationInPlace } from "@vrtmrz/livesync-commonlib/remote-configurations";
import { validateDatabaseName } from "./livesync-setup.mjs";

// Import only a CouchDB connection. Preserve its encryption/chunking settings;
// never provision, reset, unlock, or rewrite the remote database here.
export async function decodeExistingLiveSync(setupURI, setupPassphrase) {
  if (
    typeof setupURI !== "string" ||
    setupURI.length > 8192 ||
    !setupURI.startsWith("obsidian://setuplivesync?") ||
    typeof setupPassphrase !== "string" ||
    !setupPassphrase ||
    setupPassphrase.length > 2048
  )
    throw new Error("Enter the LiveSync setup URI and its setup passphrase.");
  let settings;
  try {
    settings = await decodeSettingsFromSetupURI(setupURI.trim(), setupPassphrase);
  } catch {
    throw new Error("Could not open the setup URI. Check the URI and its setup passphrase.");
  }
  if (!settings || settings.remoteType || settings.configPassphraseStore || settings.encryptedCouchDBConnection)
    throw new Error(
      "Use a setup URI with an accessible CouchDB connection. Other LiveSync remote types are not supported."
    );
  let address;
  try {
    address = new URL(settings.couchDB_URI);
  } catch {
    throw new Error("The setup URI needs a valid HTTPS CouchDB address.");
  }
  if (
    address.protocol !== "https:" ||
    address.username ||
    address.password ||
    address.search ||
    address.hash ||
    !address.hostname ||
    isIP(address.hostname.replace(/^\[|\]$/g, "")) ||
    address.hostname === "localhost" ||
    /\.(localhost|local)$/.test(address.hostname)
  )
    throw new Error("Use an HTTPS CouchDB hostname without credentials in its address.");
  const database = validateDatabaseName(settings.couchDB_DBNAME);
  if (
    typeof settings.couchDB_USER !== "string" ||
    !settings.couchDB_USER ||
    settings.couchDB_USER.length > 256 ||
    typeof settings.couchDB_PASSWORD !== "string" ||
    !settings.couchDB_PASSWORD ||
    settings.couchDB_PASSWORD.length > 2048 ||
    (settings.encrypt && (typeof settings.passphrase !== "string" || !settings.passphrase))
  )
    throw new Error("The setup URI is missing connection or vault encryption credentials.");
  settings.remoteConfigurations = {};
  settings.activeConfigurationId = "";
  upsertRemoteConfigurationInPlace(settings, "couchdb", { activate: true });
  return { settings, database, connectionUrl: address.href.replace(/\/$/, "") };
}

export async function verifyExistingLiveSync(connection, request = fetch) {
  const response = await request(`${connection.connectionUrl}/${encodeURIComponent(connection.database)}`, {
    method: "GET",
    redirect: "error",
    signal: AbortSignal.timeout(10_000),
    headers: {
      Authorization: `Basic ${Buffer.from(`${connection.settings.couchDB_USER}:${connection.settings.couchDB_PASSWORD}`).toString("base64")}`
    }
  }).catch(() => {
    throw new Error("Could not reach the existing LiveSync database. Check its address and server connectivity.");
  });
  if (!response.ok) throw new Error(`The existing LiveSync database refused access (HTTP ${response.status}).`);
  const reader = response.body?.getReader();
  if (!reader) throw new Error("The LiveSync database returned an unexpected response.");
  const chunks = [];
  let bytes = 0;
  for (;;) {
    const chunk = await reader.read();
    if (chunk.done) break;
    bytes += chunk.value.byteLength;
    if (bytes > 65536) {
      await reader.cancel();
      throw new Error("The LiveSync database returned an unexpected response.");
    }
    chunks.push(chunk.value);
  }
  const text = Buffer.concat(chunks).toString("utf8");
  let status;
  try {
    status = JSON.parse(text);
  } catch {
    throw new Error("The address did not return a LiveSync database.");
  }
  if (status.db_name !== connection.database)
    throw new Error("The address did not return the selected LiveSync database.");
}

export async function existingWorkerConfiguration(connection, setupPassphrase, revision) {
  const setupURI = (await encodeSettingsToSetupURI(connection.settings, setupPassphrase, [], true)).trim();
  return { enabled: true, initializeAfterFirstDevice: false, revision, setupURI, setupPassphrase };
}
