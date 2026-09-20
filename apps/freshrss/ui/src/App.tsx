import { ApplicationScreen } from "@scholarserver/ui/application-screen";
import { ReadResource } from "@scholarserver/ui/read-resource";
import { SectionFeedback } from "@scholarserver/ui/section-feedback";
import { SetupPanel, SetupProgress } from "@scholarserver/ui/setup-pipeline";
import { useReadResource } from "@scholarserver/ui/use-read-resource";
import { useEffect, useState } from "react";
import { ReaderAccess } from "./ReaderAccess";
import { ReaderAppearance } from "./ReaderAppearance";
import { ReaderSignInRequired, type ReaderStatus, readerStatusPollMilliseconds, readReaderJson } from "./reader-status";

const base = window.location.pathname.match(/^(.*\/apps\/[^/]+)/)?.[1] ?? "";
const instance = window.location.pathname.match(/\/apps\/([^/]+)/)?.[1];
const tabs = [
  { id: "overview", label: "Overview" },
  { id: "configuration", label: "Configuration" }
];

export function App() {
  const [tab, setTab] = useState(window.location.pathname.endsWith("/overview") ? "overview" : "configuration");
  const [statusResource] = useState(
    () =>
      new ReadResource<ReaderStatus>(
        async (signal) =>
          readReaderJson<ReaderStatus>(await fetch(`${base}/api/status`, { signal }), "Could not check FreshRSS."),
        30_000,
        15_000
      )
  );
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
        statusResource.invalidate(true, caught.message);
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
          onRetry={() => void statusRead.refresh(true)}
        />
      }
    >
      {status && tab === "configuration" ? (
        <SetupProgress
          stages={[
            { id: "account", label: "Your sign-in" },
            { id: "ready", label: "Ready" }
          ]}
          current={status?.ready && linked ? "ready" : "account"}
        />
      ) : null}
      {status?.ready && tab === "configuration" ? <ReaderAppearance base={base} /> : null}
      {!status ? (
        <section className="ss-card ss-stack" aria-label="Reading list status" style={{ minHeight: "14rem" }} />
      ) : null}
      {status?.ready && linked ? (
        <section className="ss-card ss-stack">
          <h2>Your reading list</h2>
          <p>Add a feed or import subscriptions in FreshRSS. New articles are checked every 30 minutes.</p>
          <ReaderAccess />
          <p>You use your ScholarServer sign-in. Signing out of ScholarServer also stops access to this reader.</p>
          <p>
            Your AI connection can read articles, list feeds and organise read or starred articles. Add or remove
            subscriptions in the reader.
          </p>
          <p>Feeds, saved articles and settings are included in ScholarServer backups.</p>
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
