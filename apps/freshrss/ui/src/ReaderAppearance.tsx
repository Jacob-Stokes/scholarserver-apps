import { useEffect, useState } from "react";

export function ReaderAppearance({ base }: { base: string }) {
  const [style, setStyle] = useState("scholarserver");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    fetch(`${base}/api/appearance`)
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not load the reader appearance. Reload to try again.");
        setStyle((await response.json()).style);
        setLoading(false);
      })
      .catch((caught) => setError(caught.message));
  }, [base]);
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
      if (!response.ok) throw new Error("Could not save. Your choice is still here; try again.");
      setMessage("Saved. Reload your reader to see the change.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save. Try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="ss-card ss-stack" aria-labelledby="reader-appearance">
      <h2 id="reader-appearance">Reader appearance</h2>
      <p>Use ScholarServer’s colours, fonts and branding, or keep FreshRSS’s own look.</p>
      <label>
        Appearance
        <select
          className="ss-input"
          value={style}
          disabled={loading || busy}
          onChange={(event) => {
            setStyle(event.target.value);
            setMessage("");
          }}
        >
          <option value="scholarserver">Match ScholarServer (default)</option>
          <option value="original">FreshRSS original</option>
        </select>
      </label>
      <p>
        Matching follows this browser’s ScholarServer theme at the same address. Your feeds and reading settings stay
        unchanged.
      </p>
      {error ? <p role="alert">{error}</p> : null}
      {message ? <p role="status">{message}</p> : null}
      <button className="ss-button" disabled={loading || busy} onClick={() => void save()}>
        {busy ? "Saving…" : "Save appearance"}
      </button>
    </section>
  );
}
