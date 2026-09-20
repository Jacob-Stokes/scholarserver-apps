import { ApplicationScreen } from "@scholarserver/ui/application-screen";
import { SectionFeedback } from "@scholarserver/ui/section-feedback";
import { SetupPanel, SetupProgress } from "@scholarserver/ui/setup-pipeline";
import { useEffect, useRef, useState } from "react";
import { ReaderAccess } from "./ReaderAccess";
import { ReaderAppearance } from "./ReaderAppearance";
import { observeReaderStatus, ReaderSignInRequired, type ReaderStatus, readReaderJson } from "./reader-status";

const base = window.location.pathname.match(/^(.*\/apps\/[^/]+)/)?.[1] ?? "";
const instance = window.location.pathname.match(/\/apps\/([^/]+)/)?.[1];
const tabs = [
  { id: "overview", label: "Overview" },
  { id: "configuration", label: "Configuration" }
];

export function App() {
  const [tab, setTab] = useState(window.location.pathname.endsWith("/overview") ? "overview" : "configuration");
  const [status, setStatus] = useState<ReaderStatus | null>(null);
  const [statusPending, setStatusPending] = useState(true);
  const [retry, setRetry] = useState(0);
  const observer = useRef<ReturnType<typeof observeReaderStatus> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  useEffect(() => {
    if (busy) return;
    const observation = observeReaderStatus({
      read: async (signal) =>
        readReaderJson(await fetch(`${base}/api/status`, { signal }), "Could not check FreshRSS."),
      accept: (value) => {
        setStatus(value);
        setStatusError(null);
      },
      failed: (caught) => {
        if (caught instanceof ReaderSignInRequired) setStatus(null);
        setStatusError(caught instanceof Error ? caught.message : "Could not check FreshRSS.");
      },
      pending: setStatusPending,
      visible: () => document.visibilityState !== "hidden"
    });
    observer.current = observation;
    const visible = () => {
      if (document.visibilityState !== "hidden") void observation.refresh();
    };
    void observation.refresh();
    document.addEventListener("visibilitychange", visible);
    return () => {
      observation.stop();
      document.removeEventListener("visibilitychange", visible);
    };
  }, [busy, retry]);
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
    observer.current?.stop();
    setStatusPending(false);
    setBusy(true);
    setError(null);
    try {
      const overview = await fetch("/api/v1/overview");
      if (!overview.ok) throw new Error("Open ScholarServer and sign in before linking this reading list.");
      const workspace = (await overview.json()).workspace.id;
      const response = await fetch(
        `/api/v1/instances/${encodeURIComponent(workspace)}/${instance}/actions/link-sign-in`,
        {
          method: "POST",
          headers: { "content-type": "application/json", "x-requested-with": "ScholarServer" },
          body: "{}"
        }
      );
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.detail ?? "Could not confirm the link. Check Configuration before trying again.");
      setStatus(result);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save. Your entries have been kept.");
    } finally {
      setBusy(false);
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
          pending={statusPending}
          hasData={status !== null}
          label="FreshRSS status"
          error={statusError}
          onRetry={() => {
            setStatusError(null);
            setRetry((value) => value + 1);
          }}
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
                disabled={busy || !instance || !!statusError}
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
