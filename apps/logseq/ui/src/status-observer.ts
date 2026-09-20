type Observation<T> = {
  read: (signal: AbortSignal) => Promise<T>;
  accept: (value: T) => void;
  failed: (error: unknown) => void;
  pending?: (value: boolean) => void;
  visible?: () => boolean;
  intervalMs?: number;
};

export class StatusAuthenticationRequired extends Error {}

// A completed setup action supersedes any older status read. Polls never queue.
export function observeStatus<T>({
  read,
  accept,
  failed,
  pending,
  visible = () => true,
  intervalMs = 2000
}: Observation<T>) {
  let stopped = false;
  let blocked = false;
  let current: AbortController | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;

  function schedule() {
    if (stopped || blocked || !visible()) return;
    clearTimeout(timer);
    timer = setTimeout(() => void refresh(), intervalMs);
  }

  async function refresh() {
    if (stopped || blocked) return;
    clearTimeout(timer);
    current?.abort();
    if (!visible()) {
      current = null;
      pending?.(false);
      return;
    }
    const request = new AbortController();
    current = request;
    pending?.(true);
    try {
      const value = await read(request.signal);
      if (!stopped && current === request) accept(value);
    } catch (error) {
      if (!stopped && current === request) {
        if (error instanceof StatusAuthenticationRequired) blocked = true;
        failed(error);
      }
    } finally {
      if (!stopped && current === request) {
        current = null;
        pending?.(false);
        schedule();
      }
    }
  }

  function retry() {
    blocked = false;
    return refresh();
  }

  function block() {
    blocked = true;
    clearTimeout(timer);
    current?.abort();
    current = null;
    pending?.(false);
  }

  function stop() {
    stopped = true;
    clearTimeout(timer);
    current?.abort();
    current = null;
    pending?.(false);
  }

  return { refresh, retry, block, stop };
}
