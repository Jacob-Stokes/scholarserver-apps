export const storageModes = new Set(["zotero-storage", "webdav", "linked-folder", "server-only"]);
export const onlineStorageModes = new Set(["metadata-only", "zotero-storage"]);

function onlineSetupState(account, storageMode) {
  if (!account) return "account-required";
  if (!storageMode) return "storage-required";
  return "ready";
}

function desktopSetupState({ desktop, engine, storageMode, localApi }) {
  // Account and storage setup take precedence when the desktop reports them.
  if (desktop === "available" && engine && !engine.accountConnected) return "account-required";
  if (desktop === "available" && engine?.accountConnected && !storageMode) return "storage-required";
  if (desktop !== "available" || !engine) return "setup-required";
  if (storageMode && localApi === "authorized") return "ready";
  if (storageMode) return "authorization-required";
  return "setup-required";
}

export function rememberedAuthorizationKey(result) {
  if (!result || typeof result.key !== "string" || !/^[A-Za-z0-9]{32}$/.test(result.key)) {
    throw new Error("Zotero did not return a valid local authorization key");
  }
  if (result.remember !== true) {
    throw new Error("Zotero granted single-use access. Request access again and choose Always Allow for ongoing use.");
  }
  return result.key;
}

export function onlineLibraryStatus({ config, account, accountError, lastError, variant }) {
  const savedAccount = config?.mode === "online-library" ? config : null;
  const storageMode = onlineStorageModes.has(savedAccount?.storageMode) ? savedAccount.storageMode : null;
  return {
    state: onlineSetupState(account, storageMode),
    variant,
    connectionMode: "online-library",
    desktop: "not-installed",
    version: null,
    localApi: "not-applicable",
    storageMode,
    accountConnected: Boolean(account),
    userId: account?.userId ?? savedAccount?.userId ?? null,
    username: account?.username ?? savedAccount?.username ?? null,
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
}

export function desktopWorkspaceStatus({ config, desktop, localApi, version, engine, lastError, variant }) {
  const storageMode = storageModes.has(config?.storageMode) ? config.storageMode : null;
  return {
    state: desktopSetupState({ desktop, engine, storageMode, localApi }),
    variant,
    connectionMode: "complete-workspace",
    desktop,
    version,
    localApi,
    storageMode,
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
}
