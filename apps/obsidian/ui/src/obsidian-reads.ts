import type { EndpointAccessOption } from "@scholarserver/ui/endpoint-access";
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
  const connection = scope.create((signal) => readLiveSyncAccess(base, signal), 2000);
  return { status, connection, block: scope.block, accessSignal: scope.signal };
}

export type LiveSyncAccess = {
  options: EndpointAccessOption[];
  selection: { optionId: string; transport: string; authentication: string; url: string } | null;
};

export async function readLiveSyncAccess(base: string, signal: AbortSignal, enable = false): Promise<LiveSyncAccess> {
  const instance = base.match(/\/apps\/([^/]+)$/)?.[1];
  if (!instance) throw new Error("Open this application through ScholarServer to configure its private connection.");
  let response: Response;
  try {
    response = await fetch(`/api/v1/instances/${instance}/endpoints/livesync-couchdb/access-options`, {
      method: enable ? "PUT" : "GET",
      headers: enable ? { "content-type": "application/json" } : undefined,
      body: enable ? JSON.stringify({ optionId: "tailscale", authentication: "none" }) : undefined,
      redirect: enable ? "error" : "manual",
      cache: "no-store",
      signal
    });
  } catch {
    throw new Error(
      enable
        ? "The connection was interrupted. The address may already be saved. Refresh its status before retrying."
        : "Could not read the private connection. Check your connection and refresh its status."
    );
  }
  if (
    response.status === 401 ||
    response.status === 403 ||
    response.type === "opaqueredirect" ||
    response.redirected ||
    (response.status >= 300 && response.status < 400) ||
    response.headers.get("content-type")?.includes("text/html")
  ) {
    throw new ReadAccessRequired("Open ScholarServer and sign in again, then retry.");
  }
  if (!response.ok)
    throw new Error("ScholarServer could not confirm the private connection. Check Access and application activity.");
  const value = await response.json().catch(() => null);
  if (!value || !Array.isArray(value.options) || !("selection" in value)) {
    throw new Error("ScholarServer returned an incomplete connection response. Refresh its status before continuing.");
  }
  return value;
}

export function selectedLiveSyncUrl(access: LiveSyncAccess, managerOrigin: string): string {
  const selected = access.selection;
  const option = access.options.find((candidate) => candidate.id === selected?.optionId);
  if (
    !selected ||
    selected.optionId !== "tailscale" ||
    selected.transport !== "tailscale" ||
    selected.authentication !== "none" ||
    !option ||
    option.transport !== "tailscale" ||
    option.authentication.authentik !== "unsupported" ||
    option.url !== selected.url
  ) {
    throw new Error("Set up the private LiveSync connection before continuing.");
  }
  const url = new URL(selected.url);
  if (
    url.protocol !== "https:" ||
    !url.hostname.endsWith(".ts.net") ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    url.origin === managerOrigin
  ) {
    throw new Error("LiveSync needs its own private HTTPS address. Check Access in ScholarServer.");
  }
  return url.origin;
}
