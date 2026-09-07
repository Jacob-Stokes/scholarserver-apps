import type { EndpointAccessOption } from "@scholarserver/ui/endpoint-access";

export type Access = { options: EndpointAccessOption[]; selection: { url: string } | null };
export type Endpoint = "sync" | "editor";

export async function readAccess(
  instanceId: string,
  endpoint: Endpoint,
  enable: boolean,
  signal: AbortSignal,
  send: typeof fetch = fetch
): Promise<Access> {
  let response: Response;
  try {
    response = await send(`/api/v1/instances/${encodeURIComponent(instanceId)}/endpoints/${endpoint}/access-options`, {
      method: enable ? "PUT" : "GET",
      headers: enable ? { "content-type": "application/json" } : undefined,
      body: enable ? JSON.stringify({ optionId: "tailscale", authentication: "none" }) : undefined,
      signal,
      redirect: "error"
    });
  } catch {
    throw new Error(
      enable
        ? "The connection was interrupted. An address may already be saved. Reopen setup to check before retrying."
        : "Could not reach ScholarServer. Check your connection and try again."
    );
  }
  if (response.status === 401 || response.status === 403) {
    throw new Error("Open ScholarServer and sign in again, then return to Logseq setup.");
  }
  if (response.status === 409) {
    throw new Error(
      "Private access is not ready, or another change is in progress. Check Access in ScholarServer, then retry."
    );
  }
  if (!response.ok) throw new Error("ScholarServer could not prepare this address. Check its activity and try again.");
  const result = await response.json().catch(() => null);
  if (!result || !Array.isArray(result.options) || !("selection" in result)) {
    throw new Error("ScholarServer returned an incomplete address response. Reload setup to check its status.");
  }
  return result;
}

function selectedUrl(value: Access): string {
  const url = value.selection?.url;
  if (!url) throw new Error("No private address was returned. Reload setup to check whether it was saved.");
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || parsed.username || parsed.password) {
    throw new Error("The returned address is not a secure private address. Check Access in ScholarServer.");
  }
  return url;
}

export async function connectPrivateAddresses({
  browserAvailable,
  access,
  configure,
  signal
}: {
  browserAvailable: boolean;
  access: (endpoint: Endpoint) => Promise<Access>;
  configure: (url: string) => Promise<unknown>;
  signal: AbortSignal;
}): Promise<string | null> {
  signal.throwIfAborted();
  const syncUrl = selectedUrl(await access("sync"));
  signal.throwIfAborted();
  let editorUrl: string | null = null;
  if (browserAvailable) {
    editorUrl = selectedUrl(await access("editor"));
    signal.throwIfAborted();
  }
  // Routes may already exist after an interruption. Reuse the platform's stable
  // assignment; never configure the notebook before all requested routes exist.
  await configure(syncUrl);
  signal.throwIfAborted();
  return editorUrl;
}
