import { type EndpointAccessOption, EndpointAccessSelector } from "@scholarserver/ui/endpoint-access";
import { useEffect, useState } from "react";

const instance = window.location.pathname.match(/\/apps\/([^/]+)/)?.[1];
const endpoint = `/api/v1/instances/${instance}/endpoints/reader/access-options`;
export function ReaderAccess() {
  const [options, setOptions] = useState<EndpointAccessOption[]>([]);
  const [optionId, setOptionId] = useState("tailscale");
  const [authentication, setAuthentication] = useState<"none" | "authentik">("none");
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!instance) return;
    void fetch(endpoint)
      .then(async (response) => {
        if (!response.ok) throw new Error("Check your connection in Access, then return here.");
        const value = await response.json();
        setOptions(value.options);
        setUrl(value.selection?.url ?? null);
        if (value.selection) {
          setOptionId(value.selection.optionId);
          setAuthentication(value.selection.authentication);
        }
      })
      .catch((caught) => setError(caught.message));
  }, []);
  async function save() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(endpoint, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ optionId, authentication })
      });
      if (!response.ok) throw new Error("Could not save the reader address. Your previous choice has been kept.");
      setUrl((await response.json()).selection.url);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="ss-stack">
      <h3>Open your reader</h3>
      {error ? <p role="alert">{error}</p> : null}
      {url ? (
        <a className="ss-button" href={url} target="_blank" rel="noreferrer">
          Open FreshRSS
        </a>
      ) : (
        <p>Choose where you will open FreshRSS.</p>
      )}
      {instance && options.length ? (
        <>
          <EndpointAccessSelector
            options={options}
            optionId={optionId}
            authentication={authentication}
            onOptionChange={(option) => setOptionId(option.id)}
            onAuthenticationChange={setAuthentication}
          />
          <button className="ss-button" disabled={busy} onClick={() => void save()}>
            {busy ? "Saving…" : "Save reader address"}
          </button>
        </>
      ) : null}
    </section>
  );
}
