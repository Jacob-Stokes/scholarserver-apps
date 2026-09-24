import { ApplicationScreen, ApplicationSettingsRow } from "@scholarserver/ui/application-screen";
import { ReadAccessRequired } from "@scholarserver/ui/read-resource";
import { SectionFeedback } from "@scholarserver/ui/section-feedback";
import { SetupPanel, SetupProgress } from "@scholarserver/ui/setup-pipeline";
import { useReadResource } from "@scholarserver/ui/use-read-resource";
import { useEffect, useRef, useState } from "react";
import { createLogseqReads } from "./logseq-reads";
import { PrivateConnection } from "./PrivateConnection";

type Account = { state: string; authorizationUrl?: string | null; error?: string | null };
type Status = {
  addressRequired?: boolean;
  syncAddress?: string | null;
  browserAvailable?: boolean;
  canRetry: boolean;
  phase: string;
  ready: boolean;
  sync: string;
  graph: string | null;
  accountConnected: boolean;
  account: Account;
  error: string | null;
};
type Remote = { "graph-id": string; "graph-name": string; "graph-e2ee?": boolean; "graph-ready-for-use?": boolean };
const stages = [
  { id: "account", label: "Account" },
  { id: "notebook", label: "Notebook" },
  { id: "ready", label: "Ready" }
];
const match = window.location.pathname.match(/^(.*\/apps\/[^/]+)/);
const base = match?.[1] ?? "";
const tabs = [
  { id: "overview", label: "Overview" },
  { id: "configuration", label: "Configuration" }
];

function currentTab() {
  return window.location.pathname.endsWith("/overview") ? "overview" : "configuration";
}

async function request<T>(endpoint: string, value?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(
    `${base}/api/${endpoint}`,
    value === undefined
      ? { signal }
      : {
          method: "POST",
          signal,
          headers: { "content-type": "application/json" },
          body: JSON.stringify(value)
        }
  );
  const contentType = response.headers.get("content-type") ?? "";
  if (response.status === 401 || response.status === 403 || response.redirected || contentType.includes("text/html")) {
    throw new ReadAccessRequired("Open ScholarServer and sign in again, then retry.");
  }
  const result = await response.json().catch(() => null);
  if (!response.ok || result === null) throw new Error(result?.error ?? "Could not reach Logseq setup. Try again.");
  return result;
}

export function App() {
  const [session, setSession] = useState(0);
  return <LogseqSession key={session} onAccessRetry={() => setSession((value) => value + 1)} />;
}

function LogseqSession({ onAccessRetry }: { onAccessRetry: () => void }) {
  const [tab, setTab] = useState(currentTab);
  const [reads] = useState(() =>
    createLogseqReads(window.location.pathname.match(/\/apps\/([^/]+)/)?.[1] ?? "", (signal) =>
      request<Status>("status", undefined, signal)
    )
  );
  const statusResource = reads.status;
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [returnLink, setReturnLink] = useState("");
  const [graphs, setGraphs] = useState<Remote[]>([]);
  const [remoteId, setRemoteId] = useState("");
  const [password, setPassword] = useState("");
  const [listed, setListed] = useState(false);
  const authenticationRevision = useRef(0);
  const statusRead = useReadResource(statusResource, 2000, !busy);
  const status = statusRead.data ?? null;
  async function refresh() {
    // An accepted write supersedes any older observation, but cannot reopen access.
    statusResource.invalidate();
    await statusResource.refresh();
  }
  function clearAuthenticationState(message: string) {
    reads.block(message);
  }
  useEffect(() => {
    return statusResource.subscribe(() => {
      if (!statusResource.getSnapshot().blocked) return;
      // Clear app-owned secrets/discovery synchronously, before a late graph read can finish.
      authenticationRevision.current++;
      setError(null);
      setGraphs([]);
      setListed(false);
      setRemoteId("");
      setReturnLink("");
      setPassword("");
    });
  }, [statusResource]);
  useEffect(() => {
    const pop = () => setTab(currentTab());
    window.addEventListener("popstate", pop);
    return () => window.removeEventListener("popstate", pop);
  }, []);
  function navigate(next: string) {
    window.history.pushState({}, "", `${base}/${next}`);
    setTab(next);
  }
  async function run(operation: () => Promise<unknown>) {
    statusResource.cancel();
    setBusy(true);
    setError(null);
    try {
      await operation();
      await refresh();
    } catch (caught) {
      if (caught instanceof ReadAccessRequired) {
        clearAuthenticationState(caught.message);
      } else {
        setError(caught instanceof Error ? caught.message : "Setup could not complete this step.");
      }
    } finally {
      setBusy(false);
    }
  }
  const needsAddress = status?.addressRequired && !status.syncAddress;
  const setupStages = status?.addressRequired ? [{ id: "connection", label: "Connection" }, ...stages] : stages;
  const stage = needsAddress
    ? "connection"
    : status?.ready
      ? "ready"
      : status?.accountConnected
        ? "notebook"
        : "account";
  const waiting = status?.account.state === "waiting";
  const authenticating = status?.account.state === "authenticating";
  let statusLabel = "Not checked";
  if (status) statusLabel = status.ready ? "Connected" : "Setup needed";
  return (
    <ApplicationScreen
      name="Logseq"
      description="Connect an encrypted Logseq notebook (graph) for research notes and AI tools."
      tabs={tabs}
      currentTab={tab}
      onNavigate={navigate}
      error={error ?? status?.error ?? status?.account.error}
      status={<span className="ss-badge">{statusLabel}</span>}
      feedback={
        <SectionFeedback
          pending={statusRead.pending}
          hasData={status !== null}
          label="Logseq status"
          error={statusRead.error}
          onRetry={() => {
            if (statusRead.blocked) onAccessRetry();
            else void statusRead.refresh(true);
          }}
        />
      }
    >
      {tab === "overview" && status ? (
        <section className="ss-card ss-stack">
          <h2>{status.ready ? "Your research notebook" : "Connect a notebook"}</h2>
          <p>{status.graph ?? "Connect an encrypted Logseq notebook to use it with your AI tools."}</p>
          {status.ready ? <p>Sync: {status.sync.replaceAll("-", " ")}</p> : null}
          <button className="ss-button" onClick={() => navigate("configuration")}>
            {status.ready ? "Connection settings" : "Continue setup"}
          </button>
        </section>
      ) : null}
      {tab === "configuration" && status && stage !== "ready" ? (
        <SetupProgress stages={setupStages} current={stage} />
      ) : null}
      {status?.addressRequired && (!status.ready || !status.syncAddress) ? (
        <PrivateConnection
          reads={reads}
          browserAvailable={Boolean(status.browserAvailable)}
          syncAddress={status.syncAddress ?? null}
          configure={async (url, signal) => {
            await request("address", { url }, signal);
            await refresh();
          }}
        />
      ) : null}
      {tab === "configuration" && status && stage === "account" ? (
        <SetupPanel
          stage={status.addressRequired ? 2 : 1}
          total={setupStages.length}
          title="Connect your Logseq account"
          description="Your notebook stays on your server. Logseq provides the account sign-in; no paid sync subscription is needed for this setup."
        >
          <div className="ss-stack">
            {!waiting && !authenticating ? (
              <button
                className="ss-button"
                disabled={busy}
                onClick={() => void run(() => request("account/start", {}))}
              >
                Start Logseq sign-in
              </button>
            ) : null}
            {waiting && status.account.authorizationUrl ? (
              <>
                <a className="ss-button" href={status.account.authorizationUrl} target="_blank" rel="noreferrer">
                  Open Logseq sign-in
                </a>
                <p>
                  After signing in, the new tab may say it cannot connect. Copy its full address and paste it below.
                </p>
                <label className="ss-field">
                  Return link
                  <input
                    className="ss-input"
                    type="password"
                    autoComplete="off"
                    value={returnLink}
                    onChange={(event) => setReturnLink(event.target.value)}
                  />
                </label>
                <button
                  className="ss-button"
                  disabled={busy || !returnLink}
                  onClick={() =>
                    void run(async () => {
                      await request("account/complete", { returnLink });
                      setReturnLink("");
                    })
                  }
                >
                  Finish sign-in
                </button>
                <button
                  className="ss-button ss-button-secondary"
                  disabled={busy}
                  onClick={() => void run(() => request("account/cancel", {}))}
                >
                  Cancel sign-in
                </button>
              </>
            ) : null}
            {authenticating ? (
              <div role="status">
                <progress aria-label="Completing sign-in" />
                <p>Completing sign-in…</p>
              </div>
            ) : null}
          </div>
        </SetupPanel>
      ) : null}
      {tab === "configuration" && status && stage === "notebook" ? (
        <SetupPanel
          stage={status.addressRequired ? 3 : 2}
          total={setupStages.length}
          title="Choose your notebook"
          description="Create an encrypted notebook in Logseq using this server’s sync address, or choose one already there. Existing notebooks are never replaced."
        >
          <div className="ss-stack">
            {status.phase === "downloading" || status.phase === "starting" ? (
              <div role="status">
                <progress aria-label="Connecting notebook" />
                <p>Connecting your notebook. You can return to this page later.</p>
              </div>
            ) : status.graph ? (
              <>
                <p>
                  Your selected notebook is <strong>{status.graph}</strong>. Its files are preserved.
                </p>
                {status.canRetry ? (
                  <>
                    <p>
                      Retry keeps the incomplete download in a recovery folder. Your remote notebook is not changed.
                    </p>
                    <label className="ss-field">
                      Notebook encryption password
                      <input
                        className="ss-input"
                        type="password"
                        autoComplete="off"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                      />
                    </label>
                    <button
                      className="ss-button"
                      disabled={busy || !password}
                      onClick={() =>
                        void run(async () => {
                          await request("retry", { password });
                          setPassword("");
                        })
                      }
                    >
                      Retry download
                    </button>
                  </>
                ) : null}
              </>
            ) : (
              <>
                <button
                  className="ss-button ss-button-secondary"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      const revision = authenticationRevision.current;
                      const result = await request<{ graphs: Remote[] }>("graphs");
                      if (revision !== authenticationRevision.current) return;
                      setGraphs(result.graphs);
                      setListed(true);
                    })
                  }
                >
                  Find my notebooks
                </button>
                {listed && !graphs.length ? (
                  <p>
                    No notebooks found yet. In Logseq, click your notebook’s sync icon and confirm its upload, then try
                    again.
                  </p>
                ) : null}
                {graphs.length ? (
                  <>
                    <label className="ss-field">
                      Notebook
                      <select
                        className="ss-input"
                        value={remoteId}
                        onChange={(event) => setRemoteId(event.target.value)}
                      >
                        <option value="">Choose a notebook</option>
                        {graphs.map((graph) => (
                          <option
                            key={graph["graph-id"]}
                            value={graph["graph-id"]}
                            disabled={!graph["graph-e2ee?"] || !graph["graph-ready-for-use?"]}
                          >
                            {graph["graph-name"]}
                            {!graph["graph-e2ee?"] ? " — encryption required" : ""}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="ss-field">
                      Notebook encryption password
                      <input
                        className="ss-input"
                        type="password"
                        autoComplete="off"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                      />
                      <span className="ss-field-help">Sent only to your server so Logseq can open this notebook.</span>
                    </label>
                    <button
                      className="ss-button"
                      disabled={busy || !remoteId || !password}
                      onClick={() =>
                        void run(async () => {
                          await request("join", { remoteId, password });
                          setPassword("");
                        })
                      }
                    >
                      Connect notebook
                    </button>
                  </>
                ) : null}
              </>
            )}
          </div>
        </SetupPanel>
      ) : null}
      {tab === "configuration" && status && stage === "ready" ? (
        <ApplicationSettingsRow
          title="Current settings"
          description={
            <div className="ss-stack">
              <p className="ss-card-description">
                This notebook is connected. Setup will not be run again automatically.
              </p>
              {status.syncAddress ? (
                <p className="ss-card-description">
                  Keep Tailscale connected on each device that uses this private sync address.
                </p>
              ) : null}
              <dl className="ss-details">
                <dt>Notebook</dt>
                <dd>{status.graph ?? "Not reported"}</dd>
                <dt>Sync</dt>
                <dd>{status.sync.replaceAll("-", " ")}</dd>
                {status.syncAddress ? (
                  <>
                    <dt>Sync address</dt>
                    <dd>
                      <code className="ss-code">{status.syncAddress}</code>
                    </dd>
                  </>
                ) : null}
              </dl>
            </div>
          }
          action={
            <button className="ss-button ss-button-secondary" onClick={() => void refresh()}>
              Check connection
            </button>
          }
        />
      ) : null}
    </ApplicationScreen>
  );
}
