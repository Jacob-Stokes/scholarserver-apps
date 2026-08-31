export function prepareLiveSyncWorker({ revision, setupURI, setupPassphrase }) {
  return {
    enabled: false,
    initializeAfterFirstDevice: true,
    revision,
    setupURI,
    setupPassphrase
  };
}

export function activateLiveSyncWorker(config, revision) {
  if (!config?.setupURI || !config?.setupPassphrase) {
    throw new Error("LiveSync setup details are no longer available; prepare the connection again");
  }
  return { ...config, enabled: true, revision };
}

export function restoredLiveSyncState(onboarding, workerConfig) {
  if (!onboarding) return "ready";
  return workerConfig?.enabled ? "livesync-server-joining" : "livesync-device-setup";
}
