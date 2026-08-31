export function daemonStateFromOutput(output) {
  if (/Remote database is locked|Remote Database: LOCKED/i.test(output)) {
    return {
      state: "blocked",
      lastError: "The first Obsidian device has not finished preparing LiveSync yet"
    };
  }
  if (/NOW TRACKING|Polling mode: syncing/i.test(output)) {
    return { state: "ready", lastError: null };
  }
  return null;
}

export function configuredWorkerFile(config) {
  return {
    enabled: true,
    configured: true,
    revision: config.revision
  };
}
