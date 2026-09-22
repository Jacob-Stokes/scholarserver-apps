import { type EndpointAccessOption, EndpointAccessSelector } from "@scholarserver/ui/endpoint-access";
import { ReadAccessRequired, ReadResource } from "@scholarserver/ui/read-resource";
import { SectionFeedback } from "@scholarserver/ui/section-feedback";
import { useReadResource } from "@scholarserver/ui/use-read-resource";
import { useMemo, useState } from "react";

type Authentication = "none" | "authentik";
type Access = {
  options: EndpointAccessOption[];
  selection: { optionId: string; authentication: Authentication; url: string } | null;
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

function selectedAuthentication(option: EndpointAccessOption, saved?: Authentication): Authentication {
  if (option.authentication.authentik === "required") return "authentik";
  const enabled = saved === "authentik" || (saved === undefined && option.authentication.defaultEnabled);
  return enabled && option.authentication.available ? "authentik" : "none";
}

async function readAccess(response: Response): Promise<Access> {
  if (response.status === 401 || response.status === 403) {
    throw new ReadAccessRequired("Sign in to ScholarServer to check this address.");
  }
  if (!response.ok || !response.headers.get("content-type")?.includes("application/json")) {
    throw new Error("Address choices are unavailable. Check Access, then reopen this page.");
  }
  const result = (await response.json()) as Access;
  if (!result || !Array.isArray(result.options) || result.options.some((option) => !option?.id)) {
    throw new Error("The address choices could not be read.");
  }
  return result;
}

export function DocumentAccess() {
  const instance = window.location.pathname.match(/\/apps\/([^/]+)/)?.[1];
  const endpoint = `/api/v1/instances/${encodeURIComponent(instance ?? "")}/endpoints/documents/access-options`;
  const resource = useMemo(
    () =>
      new ReadResource<Access>(async (signal) => {
        if (!instance) throw new Error("Open this application from ScholarServer to choose its document address.");
        return readAccess(await fetch(endpoint, { signal }));
      }),
    [endpoint, instance]
  );
  const [draftOption, setDraftOption] = useState<string | null>(null);
  const [draftAuthentication, setDraftAuthentication] = useState<Authentication | null>(null);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const observation = useReadResource(resource, undefined, !busy);
  const saved = observation.data;
  const options = saved?.options ?? [];
  const initial =
    options.find((option) => option.id === saved?.selection?.optionId) ??
    options.find((option) => option.recommended) ??
    options[0];
  const optionId = draftOption ?? initial?.id ?? "";
  const selected = options.find((option) => option.id === optionId);
  const authentication =
    draftAuthentication ??
    (selected
      ? selectedAuthentication(
          selected,
          selected.id === saved?.selection?.optionId ? saved.selection.authentication : undefined
        )
      : "none");
  const address = safeAddress(saved?.selection?.url);
  const unavailableSignIn = selected?.authentication.authentik === "required" && !selected.authentication.available;

  async function save() {
    if (!selected || !saved || busy || observation.pending || observation.blocked) return;
    resource.cancel();
    setBusy(true);
    setSaveError(null);
    try {
      const response = await fetch(endpoint, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ optionId, authentication }),
        signal: AbortSignal.timeout(30_000)
      });
      const result = await readAccess(response);
      if (!safeAddress(result.selection?.url)) throw new Error("The saved address was not confirmed.");
      if (resource.getSnapshot().blocked) return;
      resource.seed(result);
      setDraftOption(null);
      setDraftAuthentication(null);
    } catch (error) {
      if (error instanceof ReadAccessRequired) resource.invalidate(true, error.message);
      if (!resource.getSnapshot().blocked) {
        setSaveError("We could not confirm the address was saved. Reopen this page to check before trying again.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="ss-card ss-stack">
      <h2>Your document address</h2>
      <p>Private access is recommended. Public access still requires your Paperless sign-in.</p>
      <SectionFeedback
        pending={observation.pending}
        hasData={!!saved}
        label="document addresses"
        error={observation.error ?? saveError}
        onRetry={observation.error && !observation.blocked ? () => void resource.refresh(true) : undefined}
      />
      {address ? (
        <a className="ss-button" href={address} target="_blank" rel="noreferrer">
          Open Paperless
        </a>
      ) : null}
      {saved && !options.length ? <p>Set up a connection in ScholarServer’s Access page first.</p> : null}
      {saved && options.length ? (
        <>
          <fieldset disabled={busy || observation.pending || observation.blocked} className="ss-stack">
            <legend>Where will you open Paperless?</legend>
            <EndpointAccessSelector
              options={options}
              optionId={optionId}
              authentication={authentication}
              onOptionChange={(option) => {
                setDraftOption(option.id);
                setDraftAuthentication(selectedAuthentication(option));
              }}
              onAuthenticationChange={setDraftAuthentication}
            />
          </fieldset>
          <button
            className="ss-button"
            disabled={busy || observation.pending || observation.blocked || !selected || unavailableSignIn}
            onClick={() => void save()}
          >
            {busy ? "Saving address…" : "Save address"}
          </button>
        </>
      ) : null}
    </section>
  );
}
