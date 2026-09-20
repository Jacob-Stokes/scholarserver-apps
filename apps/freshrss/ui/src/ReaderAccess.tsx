import { EndpointAccessSelector } from "@scholarserver/ui/endpoint-access";
import { SectionFeedback } from "@scholarserver/ui/section-feedback";
import { useReadResource } from "@scholarserver/ui/use-read-resource";
import { useState } from "react";
import { type ReaderAddresses, type ReaderReads, readerAddresses } from "./reader-reads";
import { ReaderSignInRequired, readReaderJson } from "./reader-status";

export function ReaderAccess({ reads }: { reads: ReaderReads }) {
  const [draft, setDraft] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const observation = useReadResource(reads.addresses, undefined, !busy);
  const saved = observation.data;
  const options = saved?.options ?? [];
  const optionId = draft ?? saved?.selection?.optionId ?? "";
  const url = saved?.selection?.url;
  const canSave =
    !!saved && options.some((option) => option.id === optionId) && !observation.error && !observation.pending && !busy;

  async function save() {
    if (!canSave) return;
    reads.addresses.cancel();
    setBusy(true);
    setSaveError(null);
    try {
      const response = await fetch(reads.addressEndpoint, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ optionId, authentication: "authentik" })
      });
      const result = readerAddresses(
        await readReaderJson<ReaderAddresses>(
          response,
          "Could not confirm the reader address. Check it before saving again."
        )
      );
      if (reads.addresses.getSnapshot().blocked) return;
      reads.addresses.seed(result);
      setDraft(null);
    } catch (caught) {
      if (caught instanceof ReaderSignInRequired) reads.block(caught.message);
      if (reads.addresses.getSnapshot().blocked) return;
      setSaveError(
        caught instanceof Error ? caught.message : "Could not confirm the reader address. Check it before saving again."
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="ss-stack" aria-label="Reader address" style={{ minHeight: "9rem" }}>
      <h3>Open your reader</h3>
      <SectionFeedback
        pending={observation.pending}
        hasData={!!saved}
        label="reader addresses"
        error={observation.error ?? saveError}
        onRetry={
          observation.error && !busy && !observation.pending ? () => void reads.addresses.refresh(true) : undefined
        }
      />
      {url ? (
        <a className="ss-button" href={url} target="_blank" rel="noreferrer">
          Open FreshRSS
        </a>
      ) : null}
      {!url && saved ? <p>Choose where you will open FreshRSS.</p> : null}
      {saved && options.length ? (
        <details>
          <summary>Change reader address</summary>
          <fieldset className="ss-stack" disabled={busy || observation.pending || !!observation.error}>
            <EndpointAccessSelector
              options={options}
              optionId={optionId}
              authentication="authentik"
              onOptionChange={(option) => setDraft(option.id)}
              onAuthenticationChange={() => {}}
            />
            <button className="ss-button" disabled={!canSave} onClick={() => void save()}>
              {busy ? "Saving…" : "Save reader address"}
            </button>
          </fieldset>
        </details>
      ) : null}
    </section>
  );
}
