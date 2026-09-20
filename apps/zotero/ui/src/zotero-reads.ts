import { ReadAccessRequired, ReadScope } from "@scholarserver/ui/read-resource";
import type { AutomationView } from "./AutomationsTab";
import type { AccountSession, DesktopAccessResponse, Status } from "./setup-model";
import { approvedLoginUrl } from "./setup-model";

export function accountPresentation(value: AccountSession): AccountSession {
  if (!value || typeof value.state !== "string") throw new Error("Could not read Zotero account progress.");
  return {
    state: value.state,
    error: value.error,
    loginUrl: value.loginUrl ? approvedLoginUrl(value.loginUrl) : undefined
  };
}

export async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
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
  const result = await response.json().catch(() => null);
  if (!response.ok || result === null) throw new Error(result?.error ?? result?.detail ?? "Zotero request failed");
  return result as T;
}

export function statusPresentation(value: Status): Status {
  if (!value?.features || typeof value.state !== "string") throw new Error("Could not read Zotero status.");
  const permissions = value.permissions;
  return {
    state: value.state,
    desktop: value.desktop,
    version: value.version,
    localApi: value.localApi,
    variant: value.variant,
    connectionMode: value.connectionMode,
    storageMode: value.storageMode,
    accountConnected: value.accountConnected,
    userId: value.userId,
    username: value.username,
    downloadMode: value.downloadMode,
    groupFileSync: value.groupFileSync,
    linkedFolder: value.linkedFolder,
    linkedFolderAutomation: value.linkedFolderAutomation,
    storageVerified: value.storageVerified,
    syncInProgress: value.syncInProgress,
    lastError: value.lastError,
    permissions: permissions
      ? { library: permissions.library, notes: permissions.notes, write: permissions.write, groups: permissions.groups }
      : null,
    features: {
      desktop: value.features.desktop,
      automations: value.features.automations,
      localAttachments: value.features.localAttachments
    }
  };
}

export function createZoteroReads(
  base: string,
  instanceId: string,
  onAccountLink: (url: string | null) => void = () => {}
) {
  const scope = new ReadScope();
  const platformRequest = async <T>(url: string, init?: RequestInit): Promise<T> => {
    try {
      const signal = init?.signal ? AbortSignal.any([init.signal, scope.signal]) : scope.signal;
      const result = await requestJson<T>(url, { ...init, signal });
      signal.throwIfAborted();
      return result;
    } catch (error) {
      if (error instanceof ReadAccessRequired && !init?.signal?.aborted) scope.block(error.message);
      throw error;
    }
  };
  const request = <T>(route: string, init?: RequestInit) => platformRequest<T>(`${base}/api/${route}`, init);
  return {
    request,
    platformRequest,
    accessSignal: scope.signal,
    status: scope.create(async (signal) => statusPresentation(await request<Status>("status", { signal })), 5000),
    desktop: scope.create((signal) =>
      platformRequest<DesktopAccessResponse>(
        `/api/v1/instances/${encodeURIComponent(instanceId)}/endpoints/desktop/access-options`,
        { signal }
      )
    ),
    // Only progress is retained. The app owns the transient sign-in link alongside its account form.
    account: scope.create(async (signal) => {
      const result = accountPresentation(await request<AccountSession>("account/session", { signal }));
      onAccountLink(result.loginUrl ?? null);
      return { state: result.state, error: result.error };
    }, 0),
    automations: scope.create(async (signal) => {
      const result = await request<{ automations: AutomationView[] }>("automations", { signal });
      if (!Array.isArray(result.automations)) throw new Error("Could not read Zotero automations.");
      return result.automations;
    }, 5000)
  };
}
export type ZoteroReads = ReturnType<typeof createZoteroReads>;
