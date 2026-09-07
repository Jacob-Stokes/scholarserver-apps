import { type EndpointAccessOption, EndpointAccessSelector } from "@scholarserver/ui/endpoint-access";
import { useEffect, useState } from "react";

type Access = {
  options: EndpointAccessOption[];
  selection: { optionId: string; authentication: "none" | "authentik"; url: string } | null;
};

function safeAddress(value: string | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol === "https:" && !url.username && !url.password) return url.href;
  } catch {
    return null;
  }
  return null;
}

export function DocumentAccess() {
  const instance = window.location.pathname.match(/\/apps\/([^/]+)/)?.[1];
  const endpoint = `/api/v1/instances/${instance}/endpoints/documents/access-options`;
  const [options, setOptions] = useState<EndpointAccessOption[]>([]);
  const [optionId, setOptionId] = useState("");
  const [authentication, setAuthentication] = useState<"none" | "authentik">("none");
  const [address, setAddress] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!instance) {
      setLoading(false);
      return;
    }
    const abort = new AbortController();
    async function load() {
      try {
        const response = await fetch(endpoint, {
          signal: AbortSignal.any([abort.signal, AbortSignal.timeout(15_000)])
        });
        if (!response.ok) throw new Error("Address choices are unavailable. Check Access, then reopen this page.");
        const result: Access = await response.json();
        if (abort.signal.aborted) return;
        setOptions(result.options);
        const saved = result.options.find((option) => option.id === result.selection?.optionId);
        const initial = saved ?? result.options.find((option) => option.recommended) ?? result.options[0];
        if (initial) {
          setOptionId(initial.id);
          const required = initial.authentication.authentik === "required";
          const enabled = saved
            ? result.selection?.authentication === "authentik"
            : initial.authentication.defaultEnabled;
          setAuthentication(required || (enabled && initial.authentication.available) ? "authentik" : "none");
        }
        if (saved?.url === result.selection?.url) setAddress(safeAddress(result.selection?.url));
      } catch (caught) {
        if (!abort.signal.aborted) setError(caught instanceof Error ? caught.message : "Could not check the address.");
      } finally {
        if (!abort.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => abort.abort();
  }, [endpoint, instance]);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(endpoint, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ optionId, authentication }),
        signal: AbortSignal.timeout(30_000)
      });
      if (!response.ok) throw new Error();
      const result: Access = await response.json();
      const url = safeAddress(result.selection?.url);
      if (!url) throw new Error();
      setAddress(url);
    } catch {
      setError("We could not confirm the address was saved. Reopen this page to check before trying again.");
    } finally {
      setBusy(false);
    }
  }
  const selected = options.find((option) => option.id === optionId);
  const unavailableSignIn = selected?.authentication.authentik === "required" && !selected.authentication.available;
  return (
    <section className="ss-card ss-stack">
      <h2>Your document address</h2>
      <p>Private access is recommended. Public access still requires your Paperless sign-in.</p>
      {error ? <p role="alert">{error}</p> : null}
      {loading ? <p role="status">Checking available addresses…</p> : null}
      {address ? (
        <a className="ss-button" href={address} target="_blank" rel="noreferrer">
          Open Paperless
        </a>
      ) : null}
      {!loading && !options.length ? <p>Set up a connection in ScholarServer’s Access page first.</p> : null}
      {options.length ? (
        <>
          <fieldset disabled={busy} className="ss-stack">
            <legend>Where will you open Paperless?</legend>
            <EndpointAccessSelector
              options={options}
              optionId={optionId}
              authentication={authentication}
              onOptionChange={(option) => {
                setOptionId(option.id);
                const requireSignIn = option.authentication.authentik === "required";
                const defaultSignIn = option.authentication.available && option.authentication.defaultEnabled;
                setAuthentication(requireSignIn || defaultSignIn ? "authentik" : "none");
              }}
              onAuthenticationChange={setAuthentication}
            />
          </fieldset>
          <button className="ss-button" disabled={busy || !selected || unavailableSignIn} onClick={() => void save()}>
            {busy ? "Saving address…" : "Save address"}
          </button>
        </>
      ) : null}
    </section>
  );
}
