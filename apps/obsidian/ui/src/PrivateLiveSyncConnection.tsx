import { EndpointAccessSelector } from "@scholarserver/ui/endpoint-access";
import { ReadAccessRequired } from "@scholarserver/ui/read-resource";
import { SectionFeedback } from "@scholarserver/ui/section-feedback";
import { useReadResource } from "@scholarserver/ui/use-read-resource";
import { useEffect, useRef, useState } from "react";
import { type createObsidianReads, readLiveSyncAccess, selectedLiveSyncUrl } from "./obsidian-reads";

export function PrivateLiveSyncConnection({
  base,
  reads,
  onReady
}: {
  base: string;
  reads: ReturnType<typeof createObsidianReads>;
  onReady: (url: string, signal: AbortSignal) => void | Promise<void>;
}) {
  const writing = useRef<AbortController | null>(null);
  useEffect(() => () => writing.current?.abort(), []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const connection = useReadResource(reads.connection, undefined, !busy);
  const options = (connection.data?.options ?? []).filter(
    (option) =>
      option.id === "tailscale" && option.transport === "tailscale" && option.authentication.authentik === "unsupported"
  );
  const readable = !!connection.data && !connection.error && !connection.pending;
  let savedUrl = "";
  if (readable && connection.data) {
    try {
      savedUrl = selectedLiveSyncUrl(connection.data, window.location.origin);
    } catch {
      /* Setup is still required. */
    }
  }

  async function connect() {
    if (writing.current || busy || !readable || !options.length) return;
    setBusy(true);
    setError(null);
    reads.connection.cancel();
    const controller = new AbortController();
    writing.current = controller;
    const signal = AbortSignal.any([controller.signal, reads.accessSignal, AbortSignal.timeout(180000)]);
    try {
      // Reconcile the saved selection before provisioning; never replay a lost PUT automatically.
      let access = await readLiveSyncAccess(base, signal);
      signal.throwIfAborted();
      if (!access.selection) access = await readLiveSyncAccess(base, signal, true);
      signal.throwIfAborted();
      const url = selectedLiveSyncUrl(access, window.location.origin);
      reads.connection.seed(access);
      await onReady(url, signal);
    } catch (caught) {
      if (caught instanceof ReadAccessRequired && !controller.signal.aborted) reads.block(caught.message);
      if (!controller.signal.aborted && !reads.accessSignal.aborted)
        setError(caught instanceof Error ? caught.message : "Could not confirm the private connection.");
    } finally {
      writing.current = null;
      if (!controller.signal.aborted) {
        setBusy(false);
        reads.connection.invalidate();
        void reads.connection.refresh();
      }
    }
  }

  let actionLabel = "Set up private connection";
  if (busy) actionLabel = "Checking private connection…";
  else if (savedUrl) actionLabel = "Use private connection";

  return (
    <div className="ss-stack">
      <p>
        Keep Tailscale connected on every device using this vault. LiveSync uses a separate private address and its own
        vault credentials.
      </p>
      <SectionFeedback
        pending={connection.pending}
        hasData={!!connection.data}
        label="private LiveSync connection"
        error={connection.error}
        onRetry={!busy ? () => void reads.connection.refresh(true) : undefined}
      />
      {options.length ? (
        <EndpointAccessSelector
          options={options}
          optionId="tailscale"
          authentication="none"
          onOptionChange={() => {}}
          onAuthenticationChange={() => {}}
        />
      ) : null}
      {readable && !options.length ? (
        <p>
          No private address is available. Check <a href="/settings/access">Access in ScholarServer</a>.
        </p>
      ) : null}
      {error ? <p role="alert">{error}</p> : null}
      <button className="ss-button" disabled={busy || !readable || !options.length} onClick={() => void connect()}>
        {actionLabel}
      </button>
    </div>
  );
}
