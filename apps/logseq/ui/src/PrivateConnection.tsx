import { type EndpointAccessOption, EndpointAccessSelector } from "@scholarserver/ui/endpoint-access";
import { useEffect, useRef, useState } from "react";
import { connectPrivateAddresses, readAccess } from "./private-connection";

const instanceId = window.location.pathname.match(/\/apps\/([^/]+)/)?.[1] ?? "";

export function PrivateConnection({
  browserAvailable,
  syncAddress,
  configure
}: {
  browserAvailable: boolean;
  syncAddress: string | null;
  configure: (url: string, signal: AbortSignal) => Promise<unknown>;
}) {
  const [options, setOptions] = useState<EndpointAccessOption[]>([]);
  const [editor, setEditor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const reads = useRef<AbortController | null>(null);
  const writing = useRef<AbortController | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    reads.current = controller;
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]);
    setEditor(null);
    setError(null);
    setBusy(false);
    void readAccess(instanceId, "sync", false, signal)
      .then((result) => {
        if (!controller.signal.aborted) setOptions(result.options);
      })
      .catch((error) => {
        if (!controller.signal.aborted) setError(error.message);
      });
    if (browserAvailable)
      void readAccess(instanceId, "editor", false, signal)
        .then((result) => {
          if (!controller.signal.aborted) setEditor(result.selection?.url ?? null);
        })
        .catch((error) => {
          if (!controller.signal.aborted) setError(error.message);
        });
    return () => {
      controller.abort();
      writing.current?.abort();
      writing.current = null;
    };
  }, [browserAvailable]);

  async function enable() {
    if (writing.current) return;
    reads.current?.abort();
    const controller = new AbortController();
    writing.current = controller;
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(180000)]);
    setBusy(true);
    setError(null);
    try {
      const url = await connectPrivateAddresses({
        browserAvailable,
        access: (endpoint) => readAccess(instanceId, endpoint, true, signal),
        configure: (url) => configure(url, signal),
        signal
      });
      if (!controller.signal.aborted) setEditor(url);
    } catch (error) {
      if (!controller.signal.aborted) {
        let message = "Connection setup failed. Please retry.";
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
      }
    }
  }

  return (
    <section className="ss-card ss-stack">
      <h2>Private connection</h2>
      <p>Keep Tailscale connected on devices using this notebook. Logseq handles notebook sign-in and encryption.</p>
      {error ? <p role="alert">{error}</p> : null}
      {syncAddress ? (
        <>
          <p>In Logseq’s Settings → Advanced → Logseq Sync, set the server URL to:</p>
          <code>{syncAddress}</code>
          <p>Save and reload Logseq, then sign in. Create or open an encrypted notebook.</p>
          <p>For a new notebook, click its sync icon and confirm the upload to your server.</p>
          {editor ? (
            <a className="ss-button" href={editor} target="_blank" rel="noreferrer">
              Open Logseq
            </a>
          ) : null}
        </>
      ) : (
        <>
          <EndpointAccessSelector
            options={options}
            optionId="tailscale"
            authentication="none"
            onOptionChange={() => {}}
            onAuthenticationChange={() => {}}
          />
          <button className="ss-button" disabled={busy} onClick={() => void enable()}>
            {busy ? "Setting up private addresses…" : "Set up private connection"}
          </button>
          {busy ? <progress aria-label="Setting up private addresses" /> : null}
        </>
      )}
    </section>
  );
}
