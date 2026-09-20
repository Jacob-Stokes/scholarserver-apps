import { ReadAccessRequired, ReadScope } from "@scholarserver/ui/read-resource";

export type RemoteVault = { id: string; name: string };
export type SyncProfile = "none" | "official" | "livesync";
export type LiveSyncAccessMethod = "tailscale" | "public";
export type Status = {
  state:
    | "setup-required"
    | "client-install-required"
    | "vault-selection-required"
    | "initial-sync"
    | "livesync-preparing"
    | "livesync-device-setup"
    | "livesync-server-joining"
    | "recovery-required"
    | "ready";
  profile: SyncProfile;
  remoteVault: string | null;
  scopePath: string;
  lastSyncAt: string | null;
  lastError: string | null;
  workerRunning: boolean;
  officialClient?: {
    phase: string;
    version: string | null;
    approvedVersion: string;
    error: string | null;
    receivedBytes?: number;
  } | null;
  vaults?: unknown;
  liveSyncWorker?: { state: string; running: boolean; activeRevision?: number | null; lastError: string | null } | null;
};

export type LiveSyncOnboarding = {
  accessMethod: LiveSyncAccessMethod;
  connectionUrl: string;
  setupURI: string;
  setupPassphrase: string;
};
export async function requestObsidian<T>(base: string, url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${base}/api/${url}`, {
    ...init,
    headers: init?.body ? { "content-type": "application/json", ...init.headers } : init?.headers
  });
  if (
    response.status === 401 ||
    response.status === 403 ||
    response.redirected ||
    response.headers.get("content-type")?.includes("text/html")
  ) {
    throw new ReadAccessRequired("Open ScholarServer and sign in again, then retry.");
  }
  const result = (await response.json().catch(() => null)) as T | { error?: string } | null;
  if (!response.ok || result === null)
    throw new Error((result as { error?: string } | null)?.error ?? "Obsidian returned an unreadable response");
  return result as T;
}

export function normalizeVaults(value: unknown): RemoteVault[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (typeof item === "string") return [{ id: item, name: item }];
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    let id = "";
    if (typeof record.id === "string") id = record.id;
    else if (typeof record.vaultId === "string") id = record.vaultId;
    if (!id) return [];
    return [{ id, name: typeof record.name === "string" ? record.name : id }];
  });
}

export function statusPresentation(value: Status): Status {
  if (!value || typeof value.state !== "string" || typeof value.profile !== "string")
    throw new Error("Could not read Obsidian status.");
  // Deliberate allowlist: a legacy server must not populate the snapshot with setup credentials.
  const client = value.officialClient;
  const worker = value.liveSyncWorker;
  return {
    state: value.state,
    profile: value.profile,
    remoteVault: value.remoteVault,
    scopePath: value.scopePath,
    lastSyncAt: value.lastSyncAt,
    lastError: value.lastError,
    workerRunning: value.workerRunning,
    vaults: normalizeVaults(value.vaults),
    officialClient: client
      ? {
          phase: client.phase,
          version: client.version,
          approvedVersion: client.approvedVersion,
          error: client.error,
          receivedBytes: client.receivedBytes
        }
      : null,
    liveSyncWorker: worker
      ? {
          state: worker.state,
          running: worker.running,
          activeRevision: worker.activeRevision,
          lastError: worker.lastError
        }
      : null
  };
}
export function statusPollMilliseconds(status: Status | undefined): number {
  const active = ["livesync-preparing", "livesync-server-joining", "client-install-required", "initial-sync"];
  return status && active.includes(status.state) ? 2000 : 30000;
}
export function createObsidianReads(base: string) {
  const scope = new ReadScope();
  const status = scope.create(
    async (signal) => statusPresentation(await requestObsidian<Status>(base, "status", { signal })),
    2000
  );
  return { status, block: scope.block, accessSignal: scope.signal };
}
