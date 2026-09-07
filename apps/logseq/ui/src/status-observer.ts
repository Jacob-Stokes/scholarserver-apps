type Observation<T> = {
  read: (signal: AbortSignal) => Promise<T>;
  accept: (value: T) => void;
  failed: (error: unknown) => void;
  intervalMs?: number;
};

// A completed setup action supersedes any older status read. Polls never queue.
export function observeStatus<T>({ read, accept, failed, intervalMs = 2000 }: Observation<T>) {
  let stopped = false;
  let current: AbortController | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;

  async function refresh() {
    if (stopped) return;
    clearTimeout(timer);
    current?.abort();
    const request = new AbortController();
    current = request;
    try {
      const value = await read(request.signal);
      if (!stopped && current === request) accept(value);
    } catch (error) {
      if (!stopped && current === request) failed(error);
    } finally {
      if (!stopped && current === request) {
        current = null;
        timer = setTimeout(() => void refresh(), intervalMs);
      }
    }
  }

  function stop() {
    stopped = true;
    clearTimeout(timer);
    current?.abort();
    current = null;
  }

  return { refresh, stop };
}
