import { useEffect, useSyncExternalStore } from "react";
import type { ReadResource } from "./read-resource.ts";

/** The caller owns the resource, read function and cadence; this hook owns observation only. */
export function useReadResource<T>(
  resource: ReadResource<T>,
  pollMilliseconds?: number | ((data: T | undefined) => number),
  enabled = true
) {
  const state = useSyncExternalStore(resource.subscribe, resource.getSnapshot, resource.getSnapshot);
  const revision = state.revision;
  const interval = typeof pollMilliseconds === "function" ? pollMilliseconds(state.data) : pollMilliseconds;
  useEffect(() => {
    if (!enabled) return;
    const refreshOnReturn = () => {
      if (document.visibilityState === "visible") void resource.refresh();
    };
    refreshOnReturn();
    document.addEventListener("visibilitychange", refreshOnReturn);
    let timer: ReturnType<typeof setInterval> | undefined;
    if (interval) {
      timer = setInterval(() => {
        const snapshot = resource.getSnapshot();
        if (document.visibilityState !== "visible" || snapshot.blocked) return;
        if (Date.now() - snapshot.checkedAt >= interval) void resource.refresh(true);
      }, interval);
    }
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refreshOnReturn);
      // React may immediately reattach this resource (StrictMode or another
      // consumer). Cancel only after the last subscriber has actually left.
      queueMicrotask(() => {
        if (!resource.observed) resource.cancel();
      });
    };
  }, [resource, interval, revision, enabled]);
  return { ...state, refresh: resource.refresh };
}
