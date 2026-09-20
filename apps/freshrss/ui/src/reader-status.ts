export type ReaderStatus = {
  phase: string;
  ready: boolean;
  username: string | null;
  signIn: "password" | "scholarserver";
  error?: string;
  lastRefresh?: number;
};

export class ReaderSignInRequired extends Error {}

export async function readReaderJson(response: Response, failure: string) {
  const html = response.headers.get("content-type")?.includes("text/html");
  if (response.status === 401 || response.status === 403 || html) {
    throw new ReaderSignInRequired("Sign in to ScholarServer again, then retry.");
  }
  if (!response.ok) throw new Error(failure);
  return response.json();
}

// One active observation; completion schedules the next read. Setup writes stop
// this observer first so an older poll cannot undo their displayed result.
export function observeReaderStatus({
  read,
  accept,
  failed,
  pending,
  visible
}: {
  read: (signal: AbortSignal) => Promise<ReaderStatus>;
  accept: (status: ReaderStatus) => void;
  failed: (error: unknown) => void;
  pending: (value: boolean) => void;
  visible: () => boolean;
}) {
  let stopped = false;
  let blocked = false;
  let request: AbortController | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let interval = 30_000;

  async function refresh() {
    if (stopped || blocked || request) return;
    clearTimeout(timer);
    if (!visible()) {
      timer = setTimeout(() => void refresh(), interval);
      return;
    }
    const current = new AbortController();
    request = current;
    pending(true);
    try {
      const value = await read(AbortSignal.any([current.signal, AbortSignal.timeout(15_000)]));
      if (stopped) return;
      interval = value.phase === "preparing" ? 2000 : 30_000;
      accept(value);
    } catch (error) {
      if (stopped) return;
      blocked = error instanceof ReaderSignInRequired;
      failed(error);
    } finally {
      if (!stopped) {
        request = null;
        pending(false);
        if (!blocked) timer = setTimeout(() => void refresh(), interval);
      }
    }
  }

  function stop() {
    stopped = true;
    clearTimeout(timer);
    request?.abort();
  }

  return { refresh, stop };
}
