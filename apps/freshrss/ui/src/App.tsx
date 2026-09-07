import { ApplicationScreen } from "@scholarserver/ui/application-screen";
import { SetupPanel, SetupProgress } from "@scholarserver/ui/setup-pipeline";
import { type FormEvent, useEffect, useState } from "react";
import { ReaderAccess } from "./ReaderAccess";
import { ReaderAppearance } from "./ReaderAppearance";

type Status = { phase: string; ready: boolean; username: string | null; error?: string; lastRefresh?: number };
const base = window.location.pathname.match(/^(.*\/apps\/[^/]+)/)?.[1] ?? "";
const tabs = [
  { id: "overview", label: "Overview" },
  { id: "configuration", label: "Configuration" }
];

export function App() {
  const [tab, setTab] = useState(window.location.pathname.endsWith("/overview") ? "overview" : "configuration");
  const [status, setStatus] = useState<Status | null>(null);
  const [username, setUsername] = useState("researcher");
  const [password, setPassword] = useState("");
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
  async function connect(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`${base}/api/connect`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-requested-with": "ScholarServer" },
        body: JSON.stringify({ username, password })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setPassword("");
      setStatus(result);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save. Your entries have been kept.");
    } finally {
      setBusy(false);
    }
  }
  const preparing = status?.phase === "preparing";
  return (
    <ApplicationScreen
      name="FreshRSS"
      description="Follow journals, researchers and websites in one reading list."
      tabs={tabs}
      currentTab={tab}
      onNavigate={navigate}
      loading={!status}
      error={error ?? statusError ?? status?.error}
      status={<span className="ss-badge">{status?.ready ? "Ready" : "Setup needed"}</span>}
    >
      {tab === "configuration" ? (
        <SetupProgress
          stages={[
            { id: "account", label: "Your sign-in" },
            { id: "ready", label: "Ready" }
          ]}
          current={status?.ready ? "ready" : "account"}
        />
      ) : null}
      {status?.ready && tab === "configuration" ? <ReaderAppearance base={base} /> : null}
      {status?.ready ? (
        <section className="ss-card ss-stack">
          <h2>Your reading list</h2>
          <p>Add a feed or import subscriptions in FreshRSS. New articles are checked every 30 minutes.</p>
          <ReaderAccess />
          <p>
            Sign in as <strong>{status.username}</strong> using the password you chose.
          </p>
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
          title="Create your reader sign-in"
          description="This account stays on your server. No FreshRSS subscription or cloud account is needed."
        >
          {preparing ? (
            <p role="status">Preparing your reading list… You can leave this page and come back.</p>
          ) : (
            <form className="ss-stack" onSubmit={(event) => void connect(event)}>
              <label>
                Username
                <input
                  className="ss-input"
                  autoComplete="username"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  required
                  pattern="[a-zA-Z0-9][a-zA-Z0-9_-]{0,31}"
                />
              </label>
              <label>
                Password
                <input
                  className="ss-input"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  minLength={12}
                  maxLength={200}
                  required
                />
              </label>
              <p>Use at least 12 characters. Keep this password for opening the reader.</p>
              <button className="ss-button" disabled={busy}>
                {busy ? "Saving…" : "Create reading list"}
              </button>
            </form>
          )}
        </SetupPanel>
      )}
    </ApplicationScreen>
  );
}
