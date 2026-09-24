import * as ApplicationScreenUI from "@scholarserver/ui/application-screen";
import { ApplicationScreen } from "@scholarserver/ui/application-screen";
import { SectionFeedback } from "@scholarserver/ui/section-feedback";
import { SetupPanel, SetupProgress } from "@scholarserver/ui/setup-pipeline";
import { useReadResource } from "@scholarserver/ui/use-read-resource";
import { useEffect, useState } from "react";
import { ReaderAccess } from "./ReaderAccess";
import { ReaderAppearance } from "./ReaderAppearance";
import { createReaderReads } from "./reader-reads";
import { ReaderSignInRequired, readerStatusPollMilliseconds, readReaderJson } from "./reader-status";

const base = window.location.pathname.match(/^(.*\/apps\/[^/]+)/)?.[1] ?? "";
const instance = window.location.pathname.match(/\/apps\/([^/]+)/)?.[1];
const tabs = [
  { id: "overview", label: "Overview" },
  { id: "configuration", label: "Configuration" }
];

export function App() {
  const [session, setSession] = useState(0);
  // Explicit access recovery starts a new owner. Late writes keep the retired scope.
  return <ReaderSession key={session} onAccessRetry={() => setSession((value) => value + 1)} />;
}

function ReaderSession({ onAccessRetry }: { onAccessRetry: () => void }) {
  const [tab, setTab] = useState(window.location.pathname.endsWith("/overview") ? "overview" : "configuration");
  const [reads] = useState(() => createReaderReads(base, instance));
  const statusResource = reads.status;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const statusRead = useReadResource(statusResource, readerStatusPollMilliseconds, !busy);
  const status = statusRead.data ?? null;
  useEffect(() => {
    const pop = () => setTab(window.location.pathname.endsWith("/overview") ? "overview" : "configuration");
    window.addEventListener("popstate", pop);
    return () => window.removeEventListener("popstate", pop);
  }, []);
  function navigate(next: string) {
    window.history.pushState({}, "", `${base}/${next}`);
    setTab(next);
  }
  async function connect() {
    statusResource.cancel();
    setBusy(true);
    setError(null);
    try {
      const overview = await fetch("/api/v1/overview");
      const overviewValue = await readReaderJson<{ workspace: { id: string } }>(
        overview,
        "Open ScholarServer and sign in before linking this reading list."
      );
      const workspace = overviewValue.workspace.id;
      const response = await fetch(
        `/api/v1/instances/${encodeURIComponent(workspace)}/${instance}/actions/link-sign-in`,
        {
          method: "POST",
          headers: { "content-type": "application/json", "x-requested-with": "ScholarServer" },
          body: "{}"
        }
      );
      await readReaderJson(response, "Could not confirm the link. Check Configuration before trying again.");
    } catch (caught) {
      if (caught instanceof ReaderSignInRequired) {
        reads.block(caught.message);
      } else {
        setError(caught instanceof Error ? caught.message : "Could not save. Your entries have been kept.");
      }
    } finally {
      setBusy(false);
      // Reconcile either outcome by reading; never reopen a block or replay the write.
      statusResource.invalidate();
      void statusResource.refresh();
    }
  }
  const preparing = status?.phase === "preparing";
  const linked = status?.signIn === "scholarserver";
  let statusLabel = "Not checked";
  if (status) {
    statusLabel = status.ready && linked ? "Ready" : "Setup needed";
  }
  return (
    <ApplicationScreen
      name="FreshRSS"
      description="Follow journals, researchers and websites in one reading list."
      tabs={tabs}
      currentTab={tab}
      onNavigate={navigate}
      error={error ?? status?.error}
      status={<span className="ss-badge">{statusLabel}</span>}
      feedback={
        <SectionFeedback
          pending={statusRead.pending}
          hasData={status !== null}
          label="FreshRSS status"
          error={statusRead.error}
          onRetry={statusRead.blocked ? onAccessRetry : () => void statusRead.refresh(true)}
        />
      }
    >
      {status && tab === "configuration" && !(status.ready && linked) ? (
        <SetupProgress
          stages={[
            { id: "account", label: "Your sign-in" },
            { id: "ready", label: "Ready" }
          ]}
          current={status?.ready && linked ? "ready" : "account"}
        />
      ) : null}
      {status?.ready ? (
        <div hidden={tab !== "configuration"}>
          <ReaderAppearance base={base} reads={reads} visible={tab === "configuration"} />
        </div>
      ) : null}
      {!status ? (
        <section className="ss-card ss-stack" aria-label="Reading list status" style={{ minHeight: "14rem" }} />
      ) : null}
      {status?.ready && linked ? (
        <section className="ss-card ss-stack">
          <ApplicationScreenUI.ApplicationSettingsRow
            title="Current settings"
            description={
              <p>
                Your existing FreshRSS account is linked to ScholarServer sign-in. Signing out of ScholarServer also
                stops access to this reader.
              </p>
            }
            action={
              <button className="ss-button ss-button-secondary" onClick={() => void statusResource.refresh(true)}>
                Check connection
              </button>
            }
          />
          <ReaderAccess reads={reads} />
        </section>
      ) : null}
      {status && !(status.ready && linked) ? (
        <SetupPanel
          stage={1}
          total={2}
          title="Use your ScholarServer sign-in"
          description={
            status?.username
              ? "Link your existing reading list. Your feeds, saved articles and API credentials stay unchanged."
              : "Create your reading list with your ScholarServer account. No separate FreshRSS password is needed."
          }
        >
          {preparing ? (
            <p role="status">Preparing your reading list… You can leave this page and come back.</p>
          ) : (
            <div className="ss-stack">
              <p>
                First enable dashboard sign-in in <a href="/settings/access#browser-sign-in">Settings → Access</a>.
              </p>
              {status?.username ? (
                <p>
                  Reader account: <strong>{status.username}</strong>. Linking replaces its separate browser login with
                  your ScholarServer sign-in.
                </p>
              ) : null}
              <button
                className="ss-button"
                disabled={busy || !instance || !!statusRead.error}
                onClick={() => void connect()}
              >
                {busy ? "Linking…" : "Use ScholarServer sign-in"}
              </button>
            </div>
          )}
        </SetupPanel>
      ) : null}
    </ApplicationScreen>
  );
}
