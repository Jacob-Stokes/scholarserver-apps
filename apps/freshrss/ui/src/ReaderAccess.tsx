import { type EndpointAccessOption, EndpointAccessSelector } from "@scholarserver/ui/endpoint-access";
import { SectionFeedback } from "@scholarserver/ui/section-feedback";
import { useEffect, useState } from "react";
import { ReaderSignInRequired, readReaderJson } from "./reader-status";

const instance = window.location.pathname.match(/\/apps\/([^/]+)/)?.[1];
const endpoint = `/api/v1/instances/${instance}/endpoints/reader/access-options`;
export function ReaderAccess() {
  const [options, setOptions] = useState<EndpointAccessOption[]>([]);
  const [optionId, setOptionId] = useState("tailscale");
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    if (!instance) {
      setPending(false);
      setError("Open this application from ScholarServer to choose its reader address.");
      return;
    }
    setPending(true);
    setError(null);
    void fetch(endpoint, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]) })
      .then(async (response) => {
        const value = await readReaderJson(response, "Could not load the reader addresses.");
        if (controller.signal.aborted) return;
        setOptions(value.options);
        setUrl(value.selection?.url ?? null);
        setLoaded(true);
        if (value.selection) {
          setOptionId(value.selection.optionId);
        }
      })
      .catch((caught) => {
        if (controller.signal.aborted) return;
        if (caught instanceof ReaderSignInRequired) {
          setUrl(null);
          setOptions([]);
          setLoaded(false);
        }
        setError(caught.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setPending(false);
      });
    return () => controller.abort();
  }, [retry]);
  async function save() {
    setBusy(true);
    setSaveError(null);
    try {
      const response = await fetch(endpoint, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ optionId, authentication: "authentik" })
      });
      const result = await readReaderJson(
        response,
        "Could not confirm the reader address. Check it before saving again."
      );
      setUrl(result.selection.url);
    } catch (caught) {
      if (caught instanceof ReaderSignInRequired) {
        setUrl(null);
        setOptions([]);
        setLoaded(false);
        setError(caught.message);
      }
      setSaveError(caught instanceof Error ? caught.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="ss-stack" aria-label="Reader address" style={{ minHeight: "9rem" }}>
      <h3>Open your reader</h3>
      <SectionFeedback
        pending={pending}
        hasData={loaded}
        label="reader addresses"
        error={error ?? saveError}
        onRetry={error && !busy && !pending ? () => setRetry((value) => value + 1) : undefined}
      />
      {url ? (
        <a className="ss-button" href={url} target="_blank" rel="noreferrer">
          Open FreshRSS
        </a>
      ) : null}
      {!url && loaded ? <p>Choose where you will open FreshRSS.</p> : null}
      {instance && loaded && options.length ? (
        <details>
          <summary>Change reader address</summary>
          <fieldset className="ss-stack" disabled={busy || pending || !!error}>
            <EndpointAccessSelector
              options={options}
              optionId={optionId}
              authentication="authentik"
              onOptionChange={(option) => setOptionId(option.id)}
              onAuthenticationChange={() => {}}
            />
            <button className="ss-button" disabled={busy} onClick={() => void save()}>
              {busy ? "Saving…" : "Save reader address"}
            </button>
          </fieldset>
        </details>
      ) : null}
    </section>
  );
}
