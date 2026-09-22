import { SectionFeedback } from "@scholarserver/ui/section-feedback";
import { useReadResource } from "@scholarserver/ui/use-read-resource";
import { useState } from "react";
import { type ReaderAppearanceValue, type ReaderReads, readerAppearance } from "./reader-reads";
import { ReaderSignInRequired, readReaderJson } from "./reader-status";

export function ReaderAppearance({ base, reads, visible }: { base: string; reads: ReaderReads; visible: boolean }) {
  const [draft, setDraft] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const observation = useReadResource(reads.appearance, undefined, visible && !busy);
  const loaded = !!observation.data;
  const style = draft ?? observation.data?.style ?? "";
  const canSave = loaded && !observation.pending && !observation.error && !busy;

  async function save() {
    if (!canSave) return;
    reads.appearance.cancel();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(`${base}/api/appearance`, {
        method: "PUT",
        headers: { "content-type": "application/json", "x-requested-with": "ScholarServer" },
        body: JSON.stringify({ style })
      });
      const saved = readerAppearance(
        await readReaderJson<ReaderAppearanceValue>(
          response,
          "Could not confirm the save. Your choice is still here; check before saving again."
        )
      );
      if (reads.appearance.getSnapshot().blocked) return;
      reads.appearance.seed(saved);
      setDraft(null);
      setMessage("Saved. Reload your reader to see the change.");
    } catch (caught) {
      if (caught instanceof ReaderSignInRequired) reads.block(caught.message);
      if (reads.appearance.getSnapshot().blocked) return;
      setError(caught instanceof Error ? caught.message : "Could not confirm the save. Check before saving again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="ss-card ss-stack" aria-labelledby="reader-appearance">
      <h2 id="reader-appearance">Reader appearance</h2>
      <p>Use ScholarServer’s colours, fonts and branding, or keep FreshRSS’s own look.</p>
      <SectionFeedback
        pending={observation.pending}
        hasData={loaded}
        label="reader appearance"
        error={observation.error ?? error}
        onRetry={
          observation.error && !observation.pending && !busy ? () => void reads.appearance.refresh(true) : undefined
        }
      />
      <label>
        Appearance
        <select
          className="ss-input"
          value={style}
          disabled={!canSave}
          onChange={(event) => {
            setDraft(event.target.value);
            setMessage("");
          }}
        >
          {!loaded ? <option value="">Not loaded</option> : null}
          <option value="original">FreshRSS original (default)</option>
          <option value="scholarserver">Match ScholarServer</option>
        </select>
      </label>
      <p>
        Matching follows this browser’s ScholarServer theme at the same address. Your feeds and reading settings stay
        unchanged.
      </p>
      {message ? <p role="status">{message}</p> : null}
      <button className="ss-button" disabled={!canSave} onClick={() => void save()}>
        {busy ? "Saving…" : "Save appearance"}
      </button>
    </section>
  );
}
