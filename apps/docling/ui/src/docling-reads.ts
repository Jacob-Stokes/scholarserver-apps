import { ReadAccessRequired, ReadScope } from "@scholarserver/ui/read-resource";

export type JobState = "queued" | "running" | "succeeded" | "failed";
export type Job = {
  id: string;
  sourcePath: string;
  sourceBytes: number;
  sourceAttachmentKey: string | null;
  profile: string;
  state: JobState;
  attempts: number;
  outputPath: string | null;
  error: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  updatedAt: string;
};
export type Status = {
  state: "ready" | "paused";
  engine: "available" | "unavailable";
  workerConcurrency: number;
  counts: Record<JobState, number>;
  jobs: Job[];
  outputFolder: string;
  updatedAt: string;
};
export type FileEntry = { path: string; bytes: number };
export type Settings = { defaultOcr: boolean };

export async function requestDocling<T>(base: string, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${base}/api/${path}`, {
    ...init,
    headers: init?.body ? { "content-type": "application/json", ...init.headers } : init?.headers
  });
  if (
    response.status === 401 ||
    response.status === 403 ||
    response.redirected ||
    response.headers.get("content-type")?.includes("text/html")
  ) {
    throw new ReadAccessRequired("Sign in to ScholarServer again, then retry.");
  }
  const value = (await response.json().catch(() => null)) as T | { error?: string } | null;
  if (!response.ok || value === null) {
    throw new Error((value as { error?: string } | null)?.error ?? "Docling returned an unreadable response");
  }
  return value as T;
}

export function queuePollMilliseconds(status: Status | undefined): number {
  const active = (status?.counts.running ?? 0) + (status?.counts.queued ?? 0);
  return active > 0 ? 3000 : 30000;
}

/** One mounted Docling instance owns these informational reads; drafts and writes stay outside. */
export function createDoclingReads(base: string) {
  const scope = new ReadScope();
  async function read<T>(path: string, signal: AbortSignal): Promise<T> {
    return requestDocling<T>(base, path, { signal });
  }

  const status = scope.create<Status>((signal) => read("status", signal));
  const files = scope.create<FileEntry[]>(async (signal) => {
    const result = await read<{ files: FileEntry[] }>("files?limit=100", signal);
    if (!Array.isArray(result.files)) throw new Error("Could not list PDFs.");
    return result.files;
  });
  const settings = scope.create<Settings>(async (signal) => {
    try {
      const result = await read<Settings>("settings", signal);
      if (typeof result.defaultOcr !== "boolean") throw new Error("Invalid settings response");
      return result;
    } catch (error) {
      if (error instanceof ReadAccessRequired) throw error;
      throw new Error("Could not load conversion defaults. Check your connection and try again.");
    }
  });

  return { status, files, settings, block: scope.block };
}
