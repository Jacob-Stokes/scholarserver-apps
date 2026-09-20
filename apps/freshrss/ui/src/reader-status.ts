import { ReadAccessRequired } from "@scholarserver/ui/read-resource";

export type ReaderStatus = {
  phase: string;
  ready: boolean;
  username: string | null;
  signIn: "password" | "scholarserver";
  error?: string;
  lastRefresh?: number;
};

// Keep the application-specific error name for ReaderAccess and ReaderAppearance.
// ReadResource recognises the shared base class and blocks later reads.
export class ReaderSignInRequired extends ReadAccessRequired {}

export async function readReaderJson<T = unknown>(response: Response, failure: string): Promise<T> {
  const contentType = response.headers.get("content-type") ?? "";
  if (response.status === 401 || response.status === 403 || response.redirected || contentType.includes("text/html")) {
    throw new ReaderSignInRequired("Sign in to ScholarServer again, then retry.");
  }
  if (!response.ok) throw new Error(failure);
  return (await response.json()) as T;
}

export function readerStatusPollMilliseconds(status: ReaderStatus | undefined): number {
  return status?.phase === "preparing" ? 2_000 : 30_000;
}
