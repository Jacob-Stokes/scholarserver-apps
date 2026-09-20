import { EndpointAccessSelector } from "@scholarserver/ui/endpoint-access";
import { ReadAccessRequired } from "@scholarserver/ui/read-resource";
import { SectionFeedback } from "@scholarserver/ui/section-feedback";
import { useReadResource } from "@scholarserver/ui/use-read-resource";
import { useEffect, useRef, useState } from "react";
import type { PrivateAddressReads } from "./logseq-reads";
import { connectPrivateAddresses, readAccess } from "./private-connection";

const instanceId = window.location.pathname.match(/\/apps\/([^/]+)/)?.[1] ?? "";

export function PrivateConnection({
  reads,
  browserAvailable,
  syncAddress,
  configure
}: {
  reads: PrivateAddressReads;
  browserAvailable: boolean;
  syncAddress: string | null;
  configure: (url: string, signal: AbortSignal) => Promise<unknown>;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const writing = useRef<AbortController | null>(null);
  const syncRead = useReadResource(reads.sync, undefined, !busy);
  const editorRead = useReadResource(reads.editor, undefined, browserAvailable && !busy);
  const options = syncRead.data?.options ?? [];
  const editor = editorRead.data?.selection?.url;
  const syncReady = !!syncRead.data && !syncRead.pending && !syncRead.error;
  const editorReady = !browserAvailable || (!!editorRead.data && !editorRead.pending && !editorRead.error);
  const hasPrivateSync = options.some((option) => option.id === "tailscale");
  const hasPrivateEditor = !browserAvailable || !!editorRead.data?.options.some((option) => option.id === "tailscale");
  const canEnable = syncReady && editorReady && hasPrivateSync && hasPrivateEditor && !busy;

  useEffect(
    () => () => {
      writing.current?.abort();
      writing.current = null;
    },
    []
  );

  async function enable() {
    if (writing.current || !canEnable) return;
    reads.sync.cancel();
    reads.editor.cancel();
    const controller = new AbortController();
    writing.current = controller;
    const signal = AbortSignal.any([controller.signal, reads.accessSignal, AbortSignal.timeout(180000)]);
    setBusy(true);
    setError(null);
    try {
      await connectPrivateAddresses({
        browserAvailable,
        access: async (endpoint) => {
          const result = await readAccess(instanceId, endpoint, true, signal);
          signal.throwIfAborted();
          reads[endpoint].seed(result);
          return result;
        },
        configure: (url) => configure(url, signal),
        signal
      });
    } catch (error) {
      if (error instanceof ReadAccessRequired && !controller.signal.aborted) reads.block(error.message);
      if (!controller.signal.aborted && !reads.sync.getSnapshot().blocked) {
        let message = "Could not confirm connection setup. Check the saved addresses before retrying.";
        if (error instanceof Error) message = error.message;
        if (signal.aborted) {
          message = "Setup took too long. An address may already be saved. Reopen setup to check before retrying.";
        }
        setError(message);
      }
    } finally {
      if (writing.current === controller) {
        writing.current = null;
        setBusy(false);
        // Observe partial/accepted routes after either outcome; never replay provisioning.
        reads.sync.invalidate();
        reads.editor.invalidate();
        void reads.sync.refresh();
        if (browserAvailable) void reads.editor.refresh();
      }
    }
  }

  return (
    <section className="ss-card ss-stack">
      <h2>Private connection</h2>
      <p>Keep Tailscale connected on devices using this notebook. Logseq handles notebook sign-in and encryption.</p>
      <SectionFeedback
        pending={syncRead.pending}
        hasData={!!syncRead.data}
        label="private sync address"
        error={syncRead.error}
        onRetry={!busy ? () => void reads.sync.refresh(true) : undefined}
      />
      {browserAvailable ? (
        <SectionFeedback
          pending={editorRead.pending}
          hasData={!!editorRead.data}
          label="Logseq browser address"
          error={editorRead.error}
          onRetry={!busy ? () => void reads.editor.refresh(true) : undefined}
        />
      ) : null}
      {error ? <p role="alert">{error}</p> : null}
      {syncAddress ? (
        <>
          <p>In Logseq’s Settings → Advanced → Logseq Sync, set the server URL to:</p>
          <code>{syncAddress}</code>
          <p>Save and reload Logseq, then sign in. Create or open an encrypted notebook.</p>
          <p>For a new notebook, click its sync icon and confirm the upload to your server.</p>
          {browserAvailable && editor ? (
            <a className="ss-button" href={editor} target="_blank" rel="noreferrer">
              Open Logseq
            </a>
          ) : null}
        </>
      ) : (
        <>
          {syncRead.data ? (
            <EndpointAccessSelector
              options={options}
              optionId="tailscale"
              authentication="none"
              onOptionChange={() => {}}
              onAuthenticationChange={() => {}}
            />
          ) : null}
          {syncReady && editorReady && (!hasPrivateSync || !hasPrivateEditor) ? (
            <p>
              No private address is available. Check <a href="/settings/access">Access in ScholarServer</a>.
            </p>
          ) : null}
          <button className="ss-button" disabled={!canEnable} onClick={() => void enable()}>
            {busy ? "Setting up private addresses…" : "Set up private connection"}
          </button>
          {busy ? <progress aria-label="Setting up private addresses" /> : null}
        </>
      )}
    </section>
  );
}
