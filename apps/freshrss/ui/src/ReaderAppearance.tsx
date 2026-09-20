import { SectionFeedback } from "@scholarserver/ui/section-feedback";
import { useEffect, useState } from "react";
import { ReaderSignInRequired, readReaderJson } from "./reader-status";

export function ReaderAppearance({ base }: { base: string }) {
  const [style, setStyle] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [retry, setRetry] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    fetch(`${base}/api/appearance`, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]) })
      .then(async (response) => {
        const value = await readReaderJson<{ style: string }>(response, "Could not load the reader appearance.");
        if (controller.signal.aborted) return;
        setStyle(value.style);
        setLoaded(true);
      })
      .catch((caught) => {
        if (!controller.signal.aborted) setError(caught.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [base, retry]);
  async function save() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(`${base}/api/appearance`, {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          "x-requested-with": "ScholarServer"
        },
        body: JSON.stringify({ style })
      });
      await readReaderJson(
        response,
        "Could not confirm the save. Your choice is still here; check before saving again."
      );
      setMessage("Saved. Reload your reader to see the change.");
    } catch (caught) {
      if (caught instanceof ReaderSignInRequired) {
        setLoaded(false);
        setStyle("");
      }
      setError(caught instanceof Error ? caught.message : "Could not save. Try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="ss-card ss-stack" aria-labelledby="reader-appearance">
      <h2 id="reader-appearance">Reader appearance</h2>
      <p>Use ScholarServer’s colours, fonts and branding, or keep FreshRSS’s own look.</p>
      <SectionFeedback
        pending={loading}
        hasData={loaded}
        label="reader appearance"
        error={error}
        onRetry={!loaded && !loading && !busy ? () => setRetry((value) => value + 1) : undefined}
      />
      <label>
        Appearance
        <select
          className="ss-input"
          value={style}
          disabled={!loaded || loading || busy}
          onChange={(event) => {
            setStyle(event.target.value);
            setMessage("");
          }}
        >
          {!loaded ? <option value="">Not loaded</option> : null}
          <option value="scholarserver">Match ScholarServer (default)</option>
          <option value="original">FreshRSS original</option>
        </select>
      </label>
      <p>
        Matching follows this browser’s ScholarServer theme at the same address. Your feeds and reading settings stay
        unchanged.
      </p>
      {message ? <p role="status">{message}</p> : null}
      <button className="ss-button" disabled={!loaded || loading || busy} onClick={() => void save()}>
        {busy ? "Saving…" : "Save appearance"}
      </button>
    </section>
  );
}
