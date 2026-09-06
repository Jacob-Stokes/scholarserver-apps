import { type EndpointAccessOption, EndpointAccessSelector } from "@scholarserver/ui/endpoint-access";
import { useEffect, useState } from "react";

type Access = { options: EndpointAccessOption[]; selection: { url: string } | null };
const instanceId = window.location.pathname.match(/\/apps\/([^/]+)/)?.[1] ?? "";

async function access(endpoint: string, enable = false): Promise<Access> {
  const response = await fetch(
    `/api/v1/instances/${instanceId}/endpoints/${endpoint}/access-options`,
    enable
      ? {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ optionId: "tailscale", authentication: "none" })
        }
      : undefined
  );
  const result = await response.json().catch(() => null);
  if (!response.ok || !result)
    throw new Error("Could not set up the private address. Check Tailscale in Access, then retry.");
  return result;
}

export function PrivateConnection({
  browserAvailable,
  syncAddress,
  configure
}: {
  browserAvailable: boolean;
  syncAddress: string | null;
  configure: (url: string) => Promise<unknown>;
}) {
  const [options, setOptions] = useState<EndpointAccessOption[]>([]);
  const [editor, setEditor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void access("sync")
      .then((result) => {
        if (!cancelled) setOptions(result.options);
      })
      .catch((error) => {
        if (!cancelled) setError(error.message);
      });
    if (browserAvailable)
      void access("editor")
        .then((result) => {
          if (!cancelled) setEditor(result.selection?.url ?? null);
        })
        .catch((error) => {
          if (!cancelled) setError(error.message);
        });
    return () => {
      cancelled = true;
    };
  }, [browserAvailable]);

  async function enable() {
    setBusy(true);
    setError(null);
    try {
      const sync = await access("sync", true);
      if (!sync.selection) throw new Error("The sync address was not saved. Please retry.");
      if (browserAvailable) {
        const browser = await access("editor", true);
        if (!browser.selection) throw new Error("The browser address was not saved. Please retry.");
        setEditor(browser.selection.url);
      }
      // Apply the address only after both selected routes exist. Retrying is
      // safe if one route was saved before the browser request was interrupted.
      await configure(sync.selection.url);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Connection setup failed. Please retry.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="ss-card ss-stack">
      <h2>Private connection</h2>
      <p>Keep Tailscale connected on devices using this notebook. Logseq handles notebook sign-in and encryption.</p>
      {error ? <p role="alert">{error}</p> : null}
      {syncAddress ? (
        <>
          <p>In Logseq, set the custom sync server to:</p>
          <code>{syncAddress}</code>
          <p>Then sign in and create or open an encrypted notebook.</p>
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
