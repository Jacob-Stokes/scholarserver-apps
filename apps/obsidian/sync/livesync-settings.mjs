export const SCHOLARSERVER_LIVESYNC_DEFAULTS = Object.freeze({
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
  usePathObfuscation: true
});

export function applyScholarServerLiveSyncDefaults(settings) {
  return Object.assign(settings, SCHOLARSERVER_LIVESYNC_DEFAULTS);
}
