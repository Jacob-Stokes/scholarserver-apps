// Zotero API v3 client. ScholarServer normally points it at Zotero 10's
// localhost API; the same request layer remains usable with the Web API.
//
// Docs: https://www.zotero.org/support/dev/web_api/v3/start

export class ZoteroError extends Error {
  constructor(
    public readonly method: string,
    public readonly path: string,
    public readonly status: number,
    public readonly detail: any,
  ) {
    super(`${method} ${path} → ${status}`);
  }
}

export class ZoteroClient {
  constructor(
    private connection: ZoteroConnection | (() => Promise<ZoteroConnection>),
  ) {}

  /** Prefix a library-relative path with /users/<id>. */
  userPath(suffix: string): string {
    return `/users/__scholarserver_user__${suffix.startsWith("/") ? suffix : "/" + suffix}`;
  }

  private async req<T = any>(method: string, path: string, body?: any, extraHeaders: Record<string, string> = {}): Promise<{ data: T; headers: Headers }> {
    const connection = typeof this.connection === "function" ? await this.connection() : this.connection;
    const baseUrl = connection.baseUrl.replace(/\/$/, "");
    const resolvedPath = path.replace("__scholarserver_user__", encodeURIComponent(String(connection.userId)));
    const res = await fetch(`${baseUrl}${resolvedPath}`, {
      method,
      headers: {
        ...(connection.token ? { Authorization: `Bearer ${connection.token}` } : {}),
        "Zotero-API-Version": "3",
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        Accept: "application/json",
        ...extraHeaders,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const raw = res.status === 204 ? "" : await res.text();
    if (!res.ok) {
      let detail: any;
      try { detail = raw ? JSON.parse(raw) : ""; } catch { detail = raw; }
      throw new ZoteroError(method, path, res.status, detail);
    }
    if (!raw) return { data: undefined as any, headers: res.headers };
    const ct = res.headers.get("content-type") ?? "";
    const data = ct.includes("application/json") ? JSON.parse(raw) : raw;
    return { data: data as T, headers: res.headers };
  }

  get<T = any>(path: string) { return this.req<T>("GET", path); }
  post<T = any>(path: string, body: any, headers: Record<string, string> = {}) { return this.req<T>("POST", path, body, headers); }
  put<T = any>(path: string, body: any, headers: Record<string, string> = {}) { return this.req<T>("PUT", path, body, headers); }
  patch<T = any>(path: string, body: any, headers: Record<string, string> = {}) { return this.req<T>("PATCH", path, body, headers); }
  delete<T = any>(path: string, headers: Record<string, string> = {}) { return this.req<T>("DELETE", path, undefined, headers); }
}

export interface ZoteroConnection {
  baseUrl: string;
  userId: string | number;
  token?: string;
}

export async function runBounded<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<Array<{ ok: boolean; item: T; result?: R; error?: string }>> {
  const out: Array<{ ok: boolean; item: T; result?: R; error?: string }> = [];
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const i = cursor++;
      try { out[i] = { ok: true, item: items[i], result: await fn(items[i]) }; }
      catch (e: any) { out[i] = { ok: false, item: items[i], error: e?.message ?? String(e) }; }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return out;
}
