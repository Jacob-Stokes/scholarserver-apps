import { ReadAccessRequired, ReadScope } from "@scholarserver/ui/read-resource";
export type Status = {
  state: string;
  connectionMode: "complete-workspace" | "online-library";
  lastError: string | null;
};

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
  if (
    !value ||
    typeof value.state !== "string" ||
    !["complete-workspace", "online-library"].includes(value.connectionMode)
  ) {
    throw new Error("Could not read Zotero status.");
  }
  return { state: value.state, connectionMode: value.connectionMode, lastError: value.lastError };
}

export function createZoteroReads(base: string) {
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
    accessSignal: scope.signal,
    status: scope.create(async (signal) => statusPresentation(await request<Status>("status", { signal })), 5000)
  };
}
export type ZoteroReads = ReturnType<typeof createZoteroReads>;
