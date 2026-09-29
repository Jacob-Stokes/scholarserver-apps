import { ApplicationScreen, applicationManagementPath } from "@scholarserver/ui/application-screen";
import { SectionFeedback } from "@scholarserver/ui/section-feedback";
import { useReadResource } from "@scholarserver/ui/use-read-resource";
import { useEffect, useState } from "react";
import { createZoteroReads } from "./zotero-reads";

const base = window.location.pathname.match(/^\/apps\/[a-z][a-z0-9-]{0,62}(?=\/|$)/)?.[0] ?? "";
const management = applicationManagementPath(window.location.pathname);
const configuration = management === "/applications" ? management : `${management}/configuration`;
const tabs = [
  { id: "attachments", label: "Attachments" },
  { id: "configuration", label: "Configuration" }
];

export function App() {
  const [session, setSession] = useState(0);
  return <ZoteroAttachments key={session} onAccessRetry={() => setSession((value) => value + 1)} />;
}

function ZoteroAttachments({ onAccessRetry }: { onAccessRetry: () => void }) {
  const [reads] = useState(() => createZoteroReads(base));
  const { request } = reads;
  const [attachmentKey, setAttachmentKey] = useState("");
  const [sourcePath, setSourcePath] = useState("");
  const [attachmentResult, setAttachmentResult] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const statusRead = useReadResource(reads.status, 5000, !busy);
  const status = statusRead.data ?? null;
  const online = status?.connectionMode === "online-library";

  useEffect(() => {
    if (!statusRead.blocked) return;
    setAttachmentKey("");
    setSourcePath("");
    setAttachmentResult(null);
    setError(null);
    setNotice(null);
  }, [statusRead.blocked]);

  async function refresh() {
    reads.status.invalidate();
    await reads.status.refresh();
  }

  async function run<T>(operation: () => Promise<T>, success: string, result: (value: T) => void) {
    if (reads.accessSignal.aborted) return;
    reads.status.cancel();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const value = await operation();
      if (reads.accessSignal.aborted) return;
      result(value);
      setNotice(success);
      await refresh();
    } catch (caught) {
      if (!reads.accessSignal.aborted) setError(caught instanceof Error ? caught.message : "The operation failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ApplicationScreen
      name="Zotero"
      description="Check attachment access and match files in your shared research folder."
      tabs={tabs}
      currentTab="attachments"
      onNavigate={(tab) => {
        if (tab === "configuration") window.location.assign(configuration);
      }}
      notice={notice}
      error={error || status?.lastError}
      feedback={
        <SectionFeedback
          pending={statusRead.pending}
          hasData={!!status}
          label="Zotero status"
          error={statusRead.error}
          onRetry={statusRead.blocked ? onAccessRetry : () => void refresh()}
        />
      }
    >
      {status && status.state !== "ready" ? (
        <p className="ss-callout ss-callout-warning">
          Your library connection needs attention. <a href={configuration}>Open Configuration</a> to finish setup.
        </p>
      ) : null}
      {status && !statusRead.blocked ? (
        <div className="ss-grid ss-grid-3">
          <section className="ss-card ss-stack">
            <div>
              <h2>Check attachment access</h2>
              <p className="ss-card-description">
                Check whether ScholarServer can read a Zotero attachment on this server.
              </p>
            </div>
            <label className="ss-field">
              Attachment key
              <input
                className="ss-input"
                maxLength={8}
                placeholder="ABCD1234"
                value={attachmentKey}
                onChange={(event) => setAttachmentKey(event.target.value.toUpperCase())}
              />
            </label>
            <button
              className="ss-button"
              disabled={busy || !/^[A-Z0-9]{8}$/.test(attachmentKey)}
              onClick={() =>
                void run(
                  () =>
                    request<unknown>("attachments/resolve", {
                      method: "POST",
                      body: JSON.stringify({ attachmentKey })
                    }),
                  "Attachment resolved.",
                  setAttachmentResult
                )
              }
            >
              Resolve
            </button>
          </section>
          {!online ? (
            <section className="ss-card ss-stack">
              <div>
                <h2>Match a shared file</h2>
                <p className="ss-card-description">
                  Find the Zotero attachment corresponding to a path inside the linked research folder.
                </p>
              </div>
              <label className="ss-field">
                Relative file path
                <input
                  className="ss-input"
                  placeholder="Papers/example.pdf"
                  value={sourcePath}
                  onChange={(event) => setSourcePath(event.target.value)}
                />
              </label>
              <button
                className="ss-button"
                disabled={busy || !sourcePath.trim()}
                onClick={() =>
                  void run(
                    () =>
                      request<unknown>("attachments/match", { method: "POST", body: JSON.stringify({ sourcePath }) }),
                    "Attachment matching completed.",
                    setAttachmentResult
                  )
                }
              >
                Find match
              </button>
            </section>
          ) : (
            <section className="ss-card">
              <h2>How online files work</h2>
              <p className="ss-card-description">
                Zotero Storage files can be fetched when needed. WebDAV and linked-file contents require the Complete
                Zotero workspace.
              </p>
            </section>
          )}
          <section className="ss-card">
            <h2>Result</h2>
            <p className="ss-card-description">Diagnostic metadata is shown without exposing the server file path.</p>
            {attachmentResult ? (
              <pre className="ss-result ss-code">{JSON.stringify(attachmentResult, null, 2)}</pre>
            ) : (
              <p className="ss-muted">No attachment checked yet.</p>
            )}
          </section>
        </div>
      ) : null}
    </ApplicationScreen>
  );
}
