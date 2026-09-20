/** Tab-local presentation snapshots. Never stores credentials, approvals or form drafts. */
export interface ReadSnapshot<T> {
  data: T | undefined;
  pending: boolean;
  error: string | null;
  checkedAt: number;
  revision: number;
  blocked: boolean;
}

/** Throw from an app-owned reader after a confirmed access denial or login redirect. */
export class ReadAccessRequired extends Error {}

export class ReadResource<T> {
  private snapshot: ReadSnapshot<T> = {
    data: undefined,
    pending: false,
    error: null,
    checkedAt: 0,
    revision: 0,
    blocked: false
  };
  private listeners = new Set<() => void>();
  private controller: AbortController | null = null;
  private promise: Promise<void> | null = null;

  constructor(
    private readonly read: (signal: AbortSignal) => Promise<T>,
    readonly maxAge = 30_000,
    private readonly timeoutMilliseconds = 15_000
  ) {}

  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  get observed() {
    return this.listeners.size > 0;
  }

  private publish(next: ReadSnapshot<T>) {
    this.snapshot = next;
    for (const listener of this.listeners) listener();
  }

  /** Stop obsolete I/O without discarding retained presentation or reopening access. */
  cancel() {
    this.controller?.abort();
    this.controller = null;
    this.promise = null;
    if (this.snapshot.pending) this.publish({ ...this.snapshot, pending: false });
  }

  seed(data: T) {
    if (this.snapshot.blocked) return;
    // A newer accepted snapshot supersedes an in-flight section read.
    this.controller?.abort();
    this.controller = null;
    this.promise = null;
    this.publish({ ...this.snapshot, data, pending: false, error: null, blocked: false, checkedAt: Date.now() });
  }

  invalidate(clear = false, error: string | null = null) {
    // Late completion handlers may invalidate data, but cannot restore access.
    if (this.snapshot.blocked && error === null) return;
    this.controller?.abort();
    this.controller = null;
    this.promise = null;
    this.publish({
      data: clear ? undefined : this.snapshot.data,
      pending: false,
      error,
      checkedAt: 0,
      revision: this.snapshot.revision + 1,
      blocked: error !== null
    });
  }

  refresh = (force = false): Promise<void> => {
    if (this.snapshot.blocked && !force) return Promise.resolve();
    if (this.promise) return this.promise;
    if (!force && this.snapshot.checkedAt && Date.now() - this.snapshot.checkedAt < this.maxAge) {
      return Promise.resolve();
    }
    const controller = new AbortController();
    this.controller = controller;
    const pending = Promise.resolve().then(async () => {
      if (this.controller !== controller) return;
      try {
        const data = await this.read(
          AbortSignal.any([controller.signal, AbortSignal.timeout(this.timeoutMilliseconds)])
        );
        if (this.controller !== controller) return;
        this.publish({ ...this.snapshot, data, pending: false, error: null, checkedAt: Date.now() });
      } catch (error) {
        if (this.controller !== controller) return;
        if (error instanceof ReadAccessRequired) {
          this.invalidate(true, error.message);
          return;
        }
        this.publish({
          ...this.snapshot,
          pending: false,
          error: error instanceof Error ? error.message : "This information could not be refreshed."
        });
      } finally {
        if (this.controller === controller) {
          this.controller = null;
          this.promise = null;
        }
      }
    });
    // Install the in-flight owner before notifying subscribers or invoking read:
    // either can synchronously throw, invalidate, or request this resource again.
    this.promise = pending;
    this.publish({ ...this.snapshot, pending: true, error: null, blocked: false });
    return pending;
  };
}
