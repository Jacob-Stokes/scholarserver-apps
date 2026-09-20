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
