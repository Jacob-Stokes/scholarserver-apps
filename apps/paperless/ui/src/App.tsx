import { ApplicationScreen } from "@scholarserver/ui/application-screen";
import { SetupPanel, SetupProgress } from "@scholarserver/ui/setup-pipeline";
import { useEffect, useState } from "react";

export function App() {
  const [tab, setTab] = useState("overview");
  const [address, setAddress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const instance = window.location.pathname.match(/\/apps\/([^/]+)/)?.[1];
    if (!instance) return;
    const abort = new AbortController();
    void fetch(`/api/v1/instances/${instance}/endpoints/documents/access-options`, { signal: abort.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("The document address is not available. Check Access.");
        const result = await response.json();
        const value = result.selection?.url;
        if (typeof value === "string" && /^https?:\/\//.test(value)) setAddress(value);
      })
      .catch(() => {
        if (!abort.signal.aborted) setError("The document address is not available. Check Access.");
      });
    return () => abort.abort();
  }, []);
  return (
    <ApplicationScreen
      name="Paperless"
      description="Find and read your archived documents."
      tabs={[
        { id: "overview", label: "Overview" },
        { id: "setup", label: "Setup" }
      ]}
      currentTab={tab}
      onNavigate={setTab}
      error={error}
      status={<span className="ss-badge">Draft · not installable</span>}
    >
      {tab === "overview" ? (
        <section className="ss-card ss-stack">
          <h2>Your document archive</h2>
          <p>
            This draft can search and read documents through a restricted Paperless account. It does not upload, delete
            or change documents.
          </p>
          {address ? (
            <a className="ss-button" href={address} rel="noreferrer" target="_blank">
              Open Paperless
            </a>
          ) : (
            <p>A document address will appear after installation and Access setup are verified.</p>
          )}
          <p>
            Original files, OCR text and permissions remain in Paperless. AI access uses one connected account, not each
            visitor’s native identity.
          </p>
          <p role="status">
            Uploads and import tracking are not connected yet. Never retry an import whose outcome is unknown without
            checking Paperless first.
          </p>
        </section>
      ) : (
        <>
          <SetupProgress
            stages={[
              { id: "review", label: "Review draft" },
              { id: "verify", label: "Verify installation" }
            ]}
            current="review"
          />
          <SetupPanel
            stage={1}
            total={2}
            title="Review before connecting"
            description="No account or service is created by this screen."
          >
            <p>
              Use a dedicated account with access only to the documents you want AI clients to read. Do not use an
              administrator token.
            </p>
            <p>
              Account setup, encrypted backup and recovery still need installation tests. Keep the original archive and
              its backups.
            </p>
            <a href="https://docs.paperless-ngx.com/usage/" target="_blank" rel="noreferrer">
              Paperless usage guide
            </a>
          </SetupPanel>
        </>
      )}
    </ApplicationScreen>
  );
}
