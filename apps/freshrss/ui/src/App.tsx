import { ApplicationScreen } from "@scholarserver/ui/application-screen";
import { SetupPanel, SetupProgress } from "@scholarserver/ui/setup-pipeline";
import { useEffect, useState } from "react";
import { ReaderAccess } from "./ReaderAccess";
import { ReaderAppearance } from "./ReaderAppearance";

type Status = {
  phase: string;
  ready: boolean;
  username: string | null;
  signIn: "password" | "scholarserver";
  error?: string;
  lastRefresh?: number;
};
const base = window.location.pathname.match(/^(.*\/apps\/[^/]+)/)?.[1] ?? "";
const instance = window.location.pathname.match(/\/apps\/([^/]+)/)?.[1];
const tabs = [
  { id: "overview", label: "Overview" },
  { id: "configuration", label: "Configuration" }
];

export function App() {
  const [tab, setTab] = useState(window.location.pathname.endsWith("/overview") ? "overview" : "configuration");
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  useEffect(() => {
    async function refresh() {
      try {
        const response = await fetch(`${base}/api/status`);
        if (!response.ok) throw new Error("Could not check FreshRSS. Retrying shortly.");
        setStatus(await response.json());
        setStatusError(null);
      } catch (caught) {
        setStatusError(caught instanceof Error ? caught.message : "Could not check FreshRSS.");
      }
    }
    void refresh();
    const timer = setInterval(() => void refresh(), 2000);
    return () => clearInterval(timer);
  }, []);
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
  return (
    <ApplicationScreen
      name="FreshRSS"
      description="Follow journals, researchers and websites in one reading list."
      tabs={tabs}
      currentTab={tab}
      onNavigate={navigate}
      loading={!status}
      error={error ?? statusError ?? status?.error}
      status={<span className="ss-badge">{status?.ready && linked ? "Ready" : "Setup needed"}</span>}
    >
      {tab === "configuration" ? (
        <SetupProgress
          stages={[
            { id: "account", label: "Your sign-in" },
            { id: "ready", label: "Ready" }
          ]}
          current={status?.ready && linked ? "ready" : "account"}
        />
      ) : null}
      {status?.ready && tab === "configuration" ? <ReaderAppearance base={base} /> : null}
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
      ) : (
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
              <button className="ss-button" disabled={busy || !instance} onClick={() => void connect()}>
                {busy ? "Linking…" : "Use ScholarServer sign-in"}
              </button>
            </div>
          )}
        </SetupPanel>
      )}
    </ApplicationScreen>
  );
}
