// Status is read by both the browser and the action mailbox. Credentials belong
// only to the explicit device-setup read, never to this retained summary.
export function publicStatus(state) {
  return {
    state: state.state,
    profile: state.profile,
    remoteVault: state.remoteVault,
    scopePath: state.scopePath,
    lastSyncAt: state.lastSyncAt,
    lastError: state.lastError,
    workerRunning: state.workerRunning
  };
}

export async function readDeviceOnboarding({ currentState, assertBinding, readOnboarding }) {
  const initial = currentState();
  if (initial.profile !== "livesync" || initial.state !== "livesync-device-setup") return null;
  await assertBinding();
  const onboarding = await readOnboarding();
  // Completion/recovery may have advanced while the file was being read.
  if (currentState() !== initial || !onboarding) return null;
  return {
    accessMethod: onboarding.accessMethod,
    connectionUrl: onboarding.connectionUrl,
    setupURI: onboarding.setupURI,
    setupPassphrase: onboarding.setupPassphrase
  };
}

// Only our fixed CouchDB operation labels and numeric HTTP status can cross
// into setup feedback. Upstream exceptions may contain credentials or vault data.
export function liveSyncSetupFailure(error) {
  const operations = new Map([
    ["CouchDB startup", "CouchDB readiness"],
    ["single-node setup", "CouchDB setup"],
    ["CouchDB configuration", "CouchDB configuration"],
    ["CouchDB system database creation", "CouchDB system database creation"],
    ["vault account creation", "LiveSync member creation"],
    ["vault database creation", "LiveSync database creation"],
    ["vault database permissions", "LiveSync database permissions"],
    ["vault account verification", "LiveSync member verification"]
  ]);
  const message = error instanceof Error ? error.message : "";
  const match = message.match(/^(.+) failed \(HTTP ([45][0-9]{2})\)$/);
  const operation = match ? operations.get(match[1]) : null;
  const cause = operation ? `${operation} failed (HTTP ${match[2]}).` : "LiveSync setup failed before completion.";
  return `${cause} Its outcome is uncertain. Check progress before another action.`;
}
