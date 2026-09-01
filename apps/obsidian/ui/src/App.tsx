import { SetupPanel, type SetupPipelineStage, SetupProgress } from "@scholarserver/ui/setup-pipeline";
import { useCallback, useEffect, useState } from "react";

type RemoteVault = { id: string; name: string };
type SyncProfile = "none" | "official" | "livesync";
type LiveSyncAccessMethod = "tailscale" | "public";
type Status = {
  state:
    | "setup-required"
    | "vault-selection-required"
    | "initial-sync"
    | "livesync-preparing"
    | "livesync-device-setup"
    | "livesync-server-joining"
    | "ready";
  profile: SyncProfile;
  remoteVault: string | null;
  scopePath: string;
  lastSyncAt: string | null;
  lastError: string | null;
  workerRunning: boolean;
  vaults?: unknown;
  liveSyncWorker?: { state: string; running: boolean; activeRevision?: number | null; lastError: string | null } | null;
  liveSyncOnboarding?: {
    accessMethod: LiveSyncAccessMethod;
    connectionUrl: string;
    setupURI: string;
    setupPassphrase: string;
  } | null;
};
type Tab = "overview" | "configuration";
type LiveSyncSetupPage = "connection" | "security" | "scope";
type OfficialSetupPage = "vault" | "scope";

const tabs: Array<{ id: Tab; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "configuration", label: "Configuration" }
];

const setupStages: SetupPipelineStage[] = [
  { id: "sync", label: "Sync method" },
  { id: "connection", label: "Connection" },
  { id: "security", label: "Vault" },
  { id: "scope", label: "AI access" },
  { id: "device", label: "Connect device" },
  { id: "ready", label: "Ready" }
];

function appBase(): string {
  const marker = "/apps/";
  const start = window.location.pathname.indexOf(marker);
  if (start < 0) return "";
  const instance = window.location.pathname.slice(start + marker.length).split("/")[0];
  return `${window.location.pathname.slice(0, start)}${marker}${instance}`;
}

const base = appBase();

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${base}/api/${url}`, {
    ...init,
    headers: init?.body ? { "content-type": "application/json", ...init.headers } : init?.headers
  });
  const result = (await response.json().catch(() => null)) as T | { error?: string } | null;
  if (!response.ok) throw new Error((result as { error?: string } | null)?.error ?? "Obsidian request failed");
  return result as T;
}

function currentTab(): Tab {
  const value = window.location.pathname.split("/").filter(Boolean).at(-1);
  return tabs.some((tab) => tab.id === value) ? (value as Tab) : "overview";
}

function normalizeVaults(value: unknown): RemoteVault[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (typeof item === "string") return [{ id: item, name: item }];
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    const id = typeof record.id === "string" ? record.id : typeof record.vaultId === "string" ? record.vaultId : "";
    return id ? [{ id, name: typeof record.name === "string" ? record.name : id }] : [];
  });
}

function profileLabel(profile: SyncProfile): string {
  if (profile === "official") return "Obsidian Sync";
  if (profile === "livesync") return "Self-hosted LiveSync";
  return "Not selected";
}

export function App() {
  const [tab, setTab] = useState<Tab>(currentTab);
  const [status, setStatus] = useState<Status | null>(null);
  const [vaults, setVaults] = useState<RemoteVault[]>([]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mfa, setMfa] = useState("");
  const [vault, setVault] = useState("");
  const [encryptionPassword, setEncryptionPassword] = useState("");
  const [scopePath, setScopePath] = useState("/");
  const [liveSyncAccess, setLiveSyncAccess] = useState<LiveSyncAccessMethod>("tailscale");
  const [connectionUrl, setConnectionUrl] = useState(() =>
    window.location.hostname.endsWith(".ts.net") ? `https://${window.location.hostname}:8443` : ""
  );
  const [vaultPassphrase, setVaultPassphrase] = useState("");
  const [vaultPassphraseAgain, setVaultPassphraseAgain] = useState("");
  const [otherSyncOff, setOtherSyncOff] = useState(false);
  const [pluginConnected, setPluginConnected] = useState(false);
  const [liveSyncPage, setLiveSyncPage] = useState<LiveSyncSetupPage>("connection");
  const [officialPage, setOfficialPage] = useState<OfficialSetupPage>("vault");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const next = await request<Status>("status");
      const nextVaults = normalizeVaults(next.vaults);
      setStatus(next);
      setScopePath(next.scopePath || "/");
      if (nextVaults.length) {
        setVaults(nextVaults);
        setVault((current) => current || nextVaults[0].id);
      }
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not inspect Obsidian");
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);
  useEffect(() => {
    if (status?.state !== "livesync-server-joining") return;
    const timer = window.setInterval(() => void refresh(), 2_000);
    return () => window.clearInterval(timer);
  }, [refresh, status?.state]);
  useEffect(() => {
    const pop = () => setTab(currentTab());
    window.addEventListener("popstate", pop);
    return () => window.removeEventListener("popstate", pop);
  }, []);

  const navigate = (next: Tab) => {
    window.history.pushState({}, "", `${base}/${next}`);
    setTab(next);
  };
  const run = async (operation: () => Promise<unknown>, success?: string) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await operation();
      if (success) setNotice(success);
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The operation failed");
    } finally {
      setBusy(false);
    }
  };

  const chooseProfile = (profile: Exclude<SyncProfile, "none">) =>
    run(() => request("profile/select", { method: "POST", body: JSON.stringify({ profile }) }));

  const signIn = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await request<Status>("account/login", {
        method: "POST",
        body: JSON.stringify({ email, password, ...(mfa ? { mfa } : {}) })
      });
      const nextVaults = normalizeVaults(result.vaults);
      setVaults(nextVaults);
      setVault(nextVaults[0]?.id ?? "");
      setPassword("");
      setMfa("");
      setOfficialPage("vault");
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not connect the account");
    } finally {
      setBusy(false);
    }
  };

  const connectVault = () =>
    run(async () => {
      await request("vault/connect", {
        method: "POST",
        body: JSON.stringify({
          vault,
          scopePath: scopePath.trim() || "/",
          ...(encryptionPassword ? { encryptionPassword } : {})
        })
      });
      setEncryptionPassword("");
    }, "The vault is connected. Continuous two-way sync and the remote MCP are ready.");

  const configureLiveSync = () =>
    run(async () => {
      if (vaultPassphrase !== vaultPassphraseAgain)
        throw new Error("The two vault encryption passphrases do not match");
      await request("livesync/configure", {
        method: "POST",
        body: JSON.stringify({
          accessMethod: liveSyncAccess,
          connectionUrl,
          vaultPassphrase,
          scopePath: scopePath.trim() || "/",
          confirmedNoOtherSync: otherSyncOff
        })
      });
      setVaultPassphrase("");
      setVaultPassphraseAgain("");
    });

  const completeLiveSync = () =>
    run(() =>
      request("livesync/complete", {
        method: "POST",
        body: JSON.stringify({ confirmedPluginConnected: pluginConnected })
      })
    );

  const copy = async (value: string, label: string) => {
    await navigator.clipboard.writeText(value);
    setNotice(`${label} copied.`);
  };

  const ready = status?.state === "ready";
  const liveSyncRunning = Boolean(status?.liveSyncWorker?.running);
  return (
    <div className="ss-app">
      <header className="ss-app-header">
        <div className="ss-app-header-inner">
          <div className="ss-brand">
            <div className="ss-brand-mark">S</div>
            <div>
              <p className="ss-brand-title">ScholarServer</p>
              <p className="ss-brand-context">Obsidian</p>
            </div>
          </div>
          <a className="ss-button ss-button-secondary" href="/">
            Back to ScholarServer
          </a>
        </div>
      </header>
      <main className="ss-main">
        <div className="ss-page-heading">
          <div>
            <h1>Obsidian</h1>
            <p>Keep a server copy of your vault synchronized and choose which folder AI tools may use.</p>
          </div>
          {status ? (
            <span className={`ss-badge ${ready ? "ss-badge-success" : "ss-badge-warning"}`}>
              {ready ? "Connected" : "Setup needed"}
            </span>
          ) : null}
        </div>
        <nav className="ss-tabs" aria-label="Obsidian sections">
          {tabs.map((item) => (
            <button key={item.id} className="ss-tab" aria-selected={tab === item.id} onClick={() => navigate(item.id)}>
              {item.label}
            </button>
          ))}
        </nav>
        {notice ? <div className="ss-alert ss-alert-success">{notice}</div> : null}
        {error ? (
          <div className="ss-alert ss-alert-error" role="alert">
            {error}
          </div>
        ) : null}
        {!status ? (
          <div className="ss-card ss-loading">
            <span className="ss-spinner" /> Loading Obsidian…
          </div>
        ) : null}

        {status && tab === "overview" ? (
          <div className="ss-stack">
            <div className="ss-grid ss-grid-3">
              <div className="ss-card">
                <div className="ss-metric-label">Sync method</div>
                <div className="ss-metric-value">{profileLabel(status.profile)}</div>
              </div>
              <div className="ss-card">
                <div className="ss-metric-label">Server sync</div>
                <div className="ss-metric-value">
                  {status.profile === "livesync"
                    ? liveSyncRunning
                      ? "Running"
                      : "Starting"
                    : status.workerRunning
                      ? "Running"
                      : "Stopped"}
                </div>
              </div>
              <div className="ss-card">
                <div className="ss-metric-label">AI-accessible folder</div>
                <div className="ss-metric-value">
                  <code className="ss-code">{status.scopePath || "/"}</code>
                </div>
              </div>
            </div>
            <section className="ss-card">
              <div className="ss-toolbar">
                <div>
                  <h2>Vault connection</h2>
                  <p className="ss-card-description">
                    {ready
                      ? `Your server replica uses ${profileLabel(status.profile)}.`
                      : "Choose and connect a sync method to begin."}
                  </p>
                </div>
                <button className="ss-button ss-button-secondary" onClick={() => void refresh()}>
                  Refresh
                </button>
              </div>
              {status.liveSyncWorker?.lastError ? (
                <div className="ss-alert ss-alert-error">{status.liveSyncWorker.lastError}</div>
              ) : null}
            </section>
            {!ready ? (
              <section className="ss-card">
                <div className="ss-toolbar">
                  <div>
                    <h2>Finish setup</h2>
                    <p className="ss-card-description">ScholarServer will guide you through the safe steps.</p>
                  </div>
                  <button className="ss-button" onClick={() => navigate("configuration")}>
                    Continue setup
                  </button>
                </div>
              </section>
            ) : null}
          </div>
        ) : null}

        {status && tab === "configuration" ? (
          <div className="ss-stack">
            {status.profile === "none" ? <ProfileChoice busy={busy} choose={chooseProfile} /> : null}
            {status.profile === "official" && status.state === "setup-required" ? (
              <OfficialLogin
                busy={busy}
                values={{ email, password, mfa }}
                setters={{ setEmail, setPassword, setMfa }}
                signIn={signIn}
              />
            ) : null}
            {status.profile === "official" &&
            (status.state === "vault-selection-required" || status.state === "initial-sync") ? (
              <OfficialVault
                page={officialPage}
                setPage={setOfficialPage}
                busy={busy}
                vaults={vaults}
                vault={vault}
                setVault={setVault}
                encryptionPassword={encryptionPassword}
                setEncryptionPassword={setEncryptionPassword}
                scopePath={scopePath}
                setScopePath={setScopePath}
                connect={connectVault}
              />
            ) : null}
            {status.profile === "livesync" && status.state === "setup-required" ? (
              <LiveSyncPrepare
                page={liveSyncPage}
                setPage={setLiveSyncPage}
                busy={busy}
                accessMethod={liveSyncAccess}
                setAccessMethod={setLiveSyncAccess}
                connectionUrl={connectionUrl}
                setConnectionUrl={setConnectionUrl}
                vaultPassphrase={vaultPassphrase}
                setVaultPassphrase={setVaultPassphrase}
                vaultPassphraseAgain={vaultPassphraseAgain}
                setVaultPassphraseAgain={setVaultPassphraseAgain}
                scopePath={scopePath}
                setScopePath={setScopePath}
                otherSyncOff={otherSyncOff}
                setOtherSyncOff={setOtherSyncOff}
                configure={configureLiveSync}
              />
            ) : null}
            {status.profile === "livesync" && status.state === "livesync-preparing" ? (
              <>
                <SetupProgress stages={setupStages} current="device" />
                <SetupPanel
                  stage={5}
                  total={6}
                  title="Preparing LiveSync"
                  description="ScholarServer is creating the private sync service before you connect Obsidian."
                >
                  <div className="ss-loading">
                    <span className="ss-spinner" />
                    <span>Starting the database and preparing encrypted vault access…</span>
                  </div>
                </SetupPanel>
              </>
            ) : null}
            {status.profile === "livesync" && status.state === "livesync-device-setup" && status.liveSyncOnboarding ? (
              <LiveSyncDevice
                onboarding={status.liveSyncOnboarding}
                busy={busy}
                pluginConnected={pluginConnected}
                setPluginConnected={setPluginConnected}
                copy={copy}
                complete={completeLiveSync}
              />
            ) : null}
            {status.profile === "livesync" && status.state === "livesync-server-joining" ? (
              <>
                <SetupProgress stages={setupStages} current="ready" />
                <SetupPanel
                  stage={6}
                  total={6}
                  title="Connecting the server copy"
                  description="Your first device is ready. ScholarServer is now downloading the vault safely."
                >
                  <div className="ss-loading">
                    <span className="ss-spinner" />
                    <span>This page updates automatically. You can keep it open.</span>
                  </div>
                  {status.lastError ? <div className="ss-alert ss-alert-error">{status.lastError}</div> : null}
                </SetupPanel>
              </>
            ) : null}
            {status.state === "ready" ? (
              <>
                <SetupProgress stages={setupStages} current="ready" />
                <SetupPanel
                  stage={6}
                  total={6}
                  title="Obsidian is connected"
                  description={`${profileLabel(status.profile)} is active and the server copy is ready.`}
                >
                  <div className="ss-alert ss-alert-success">
                    Setup is complete. Notes can now synchronize between your devices, the server, and approved AI
                    tools.
                  </div>
                  {status.profile === "livesync" ? (
                    <div className="ss-callout ss-callout-warning">
                      <strong>Keep other vault sync methods turned off.</strong> Running two sync systems against the
                      same vault can create conflicts.
                    </div>
                  ) : null}
                  <button className="ss-button ss-button-secondary" onClick={() => void refresh()}>
                    Check connection
                  </button>
                </SetupPanel>
              </>
            ) : null}
          </div>
        ) : null}
      </main>
    </div>
  );
}

function ProfileChoice({
  busy,
  choose
}: {
  busy: boolean;
  choose: (profile: "official" | "livesync") => Promise<void>;
}) {
  return (
    <>
      <SetupProgress stages={setupStages} current="sync" />
      <SetupPanel
        stage={1}
        total={6}
        title="How should this vault sync?"
        description="Choose one sync method. ScholarServer will guide you through the remaining steps."
      >
        <div className="ss-choice-grid">
          <button className="ss-choice-card" disabled={busy} onClick={() => void choose("livesync")}>
            <strong>Self-hosted LiveSync</strong>
            <span className="ss-badge ss-badge-success">Free</span>
            <p>Your notes sync through this ScholarServer. Install one free plugin on each device.</p>
          </button>
          <button className="ss-choice-card" disabled={busy} onClick={() => void choose("official")}>
            <strong>Obsidian Sync</strong>
            <span className="ss-badge">Paid account</span>
            <p>The official option. ScholarServer signs in once and keeps its own replica.</p>
          </button>
        </div>
        <div className="ss-callout">
          <strong>Use only one.</strong> Two sync systems controlling the same vault can create duplicate or conflicting
          notes.
        </div>
      </SetupPanel>
    </>
  );
}

function OfficialLogin({
  busy,
  values,
  setters,
  signIn
}: {
  busy: boolean;
  values: { email: string; password: string; mfa: string };
  setters: { setEmail: (value: string) => void; setPassword: (value: string) => void; setMfa: (value: string) => void };
  signIn: () => Promise<void>;
}) {
  return (
    <>
      <SetupProgress stages={setupStages} current="connection" />
      <SetupPanel
        stage={2}
        total={6}
        title="Connect your Obsidian account"
        description="ScholarServer uses these details once to sign in. It does not save your password or MFA code."
        next={() => void signIn()}
        nextLabel="Connect account"
        nextDisabled={!values.email || !values.password}
        busy={busy}
      >
        <label className="ss-field">
          Account email
          <input
            className="ss-input"
            type="email"
            autoComplete="username"
            value={values.email}
            onChange={(event) => setters.setEmail(event.target.value)}
          />
        </label>
        <label className="ss-field">
          Password
          <input
            className="ss-input"
            type="password"
            autoComplete="current-password"
            value={values.password}
            onChange={(event) => setters.setPassword(event.target.value)}
          />
        </label>
        <label className="ss-field">
          MFA code <span className="ss-field-help">Leave blank if your account does not use MFA.</span>
          <input
            className="ss-input"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={values.mfa}
            onChange={(event) => setters.setMfa(event.target.value)}
          />
        </label>
      </SetupPanel>
    </>
  );
}

function OfficialVault({
  page,
  setPage,
  busy,
  vaults,
  vault,
  setVault,
  encryptionPassword,
  setEncryptionPassword,
  scopePath,
  setScopePath,
  connect
}: {
  page: OfficialSetupPage;
  setPage: (page: OfficialSetupPage) => void;
  busy: boolean;
  vaults: RemoteVault[];
  vault: string;
  setVault: (value: string) => void;
  encryptionPassword: string;
  setEncryptionPassword: (value: string) => void;
  scopePath: string;
  setScopePath: (value: string) => void;
  connect: () => Promise<void>;
}) {
  if (page === "vault")
    return (
      <>
        <SetupProgress stages={setupStages} current="security" />
        <SetupPanel
          stage={3}
          total={6}
          title="Choose the vault"
          description="ScholarServer downloads a safe server copy before it enables two-way synchronization."
          next={() => setPage("scope")}
          nextDisabled={!vault}
        >
          <label className="ss-field">
            Obsidian vault
            <select className="ss-input" value={vault} onChange={(event) => setVault(event.target.value)}>
              {vaults.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <label className="ss-field">
            Vault encryption password{" "}
            <span className="ss-field-help">Leave blank if this vault is not end-to-end encrypted.</span>
            <input
              className="ss-input"
              type="password"
              value={encryptionPassword}
              onChange={(event) => setEncryptionPassword(event.target.value)}
            />
          </label>
        </SetupPanel>
      </>
    );
  return (
    <>
      <SetupProgress stages={setupStages} current="scope" />
      <SetupPanel
        stage={4}
        total={6}
        title="Choose what AI tools may use"
        description="You can expose the whole vault or restrict ScholarServer's MCP tools to one folder."
        back={() => setPage("vault")}
        next={() => void connect()}
        nextLabel="Download and connect vault"
        nextDisabled={!vault}
        busy={busy}
      >
        <label className="ss-field">
          Folder available to AI tools{" "}
          <span className="ss-field-help">Use / for the whole vault, or enter a folder such as Projects.</span>
          <input className="ss-input" value={scopePath} onChange={(event) => setScopePath(event.target.value)} />
        </label>
        <div className="ss-callout">
          <strong>Your choice:</strong> Obsidian Sync will connect{" "}
          <strong>{vaults.find((item) => item.id === vault)?.name ?? vault}</strong>; AI tools may use{" "}
          <strong>{scopePath || "/"}</strong>.
        </div>
      </SetupPanel>
    </>
  );
}

type PrepareProps = {
  page: LiveSyncSetupPage;
  setPage: (page: LiveSyncSetupPage) => void;
  busy: boolean;
  accessMethod: LiveSyncAccessMethod;
  setAccessMethod: (value: LiveSyncAccessMethod) => void;
  connectionUrl: string;
  setConnectionUrl: (value: string) => void;
  vaultPassphrase: string;
  setVaultPassphrase: (value: string) => void;
  vaultPassphraseAgain: string;
  setVaultPassphraseAgain: (value: string) => void;
  scopePath: string;
  setScopePath: (value: string) => void;
  otherSyncOff: boolean;
  setOtherSyncOff: (value: boolean) => void;
  configure: () => Promise<void>;
};
function LiveSyncPrepare(props: PrepareProps) {
  const choose = (method: LiveSyncAccessMethod) => {
    props.setAccessMethod(method);
    if (method === "tailscale" && window.location.hostname.endsWith(".ts.net"))
      props.setConnectionUrl(`https://${window.location.hostname}:8443`);
    if (method === "public" && props.connectionUrl.includes(".ts.net")) props.setConnectionUrl("");
  };
  if (props.page === "connection")
    return (
      <>
        <SetupProgress stages={setupStages} current="connection" />
        <SetupPanel
          stage={2}
          total={6}
          title="How should your devices connect?"
          description="Private Tailscale is simplest when all your devices can run it. Public HTTPS works from anywhere."
          next={() => props.setPage("security")}
          nextDisabled={!props.connectionUrl}
        >
          <div className="ss-choice-grid" role="radiogroup" aria-label="LiveSync access method">
            <button
              type="button"
              role="radio"
              aria-checked={props.accessMethod === "tailscale"}
              className={`ss-choice-card ${props.accessMethod === "tailscale" ? "ss-choice-card-selected" : ""}`}
              onClick={() => choose("tailscale")}
            >
              <strong>Private with Tailscale</strong>
              <span className="ss-badge ss-badge-success">Recommended</span>
              <p>Only devices signed into your private Tailscale network can connect.</p>
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={props.accessMethod === "public"}
              className={`ss-choice-card ${props.accessMethod === "public" ? "ss-choice-card-selected" : ""}`}
              onClick={() => choose("public")}
            >
              <strong>Public HTTPS</strong>
              <span className="ss-badge">More compatible</span>
              <p>Works without Tailscale. Requires a domain and a public HTTPS connection.</p>
            </button>
          </div>
          <label className="ss-field">
            LiveSync address{" "}
            <span className="ss-field-help">
              {props.accessMethod === "tailscale"
                ? "ScholarServer normally fills this private address for you."
                : "Use the public LiveSync hostname configured in Access."}
            </span>
            <input
              className="ss-input"
              type="url"
              placeholder={
                props.accessMethod === "tailscale"
                  ? "https://your-server.example.ts.net:8443"
                  : "https://notes-sync.example.com"
              }
              value={props.connectionUrl}
              onChange={(event) => props.setConnectionUrl(event.target.value)}
            />
          </label>
        </SetupPanel>
      </>
    );
  if (props.page === "security")
    return (
      <>
        <SetupProgress stages={setupStages} current="security" />
        <SetupPanel
          stage={3}
          total={6}
          title="Protect the vault"
          description="Choose the encryption passphrase used by every device, and turn off competing sync tools."
          back={() => props.setPage("connection")}
          next={() => props.setPage("scope")}
          nextDisabled={
            props.vaultPassphrase.length < 12 ||
            props.vaultPassphrase !== props.vaultPassphraseAgain ||
            !props.otherSyncOff
          }
        >
          <label className="ss-field">
            Vault encryption passphrase{" "}
            <span className="ss-field-help">Use at least 12 characters and save it in your password manager.</span>
            <input
              className="ss-input"
              type="password"
              autoComplete="new-password"
              value={props.vaultPassphrase}
              onChange={(event) => props.setVaultPassphrase(event.target.value)}
            />
          </label>
          <label className="ss-field">
            Repeat the passphrase
            <input
              className="ss-input"
              type="password"
              autoComplete="new-password"
              value={props.vaultPassphraseAgain}
              onChange={(event) => props.setVaultPassphraseAgain(event.target.value)}
            />
          </label>
          {props.vaultPassphraseAgain && props.vaultPassphrase !== props.vaultPassphraseAgain ? (
            <div className="ss-alert ss-alert-error">The two passphrases do not match.</div>
          ) : null}
          <label className="ss-check">
            <input
              type="checkbox"
              checked={props.otherSyncOff}
              onChange={(event) => props.setOtherSyncOff(event.target.checked)}
            />
            <span>
              <strong>I have turned off every other sync method for this vault.</strong>
              <small>This includes Obsidian Sync, iCloud, Git sync and Syncthing.</small>
            </span>
          </label>
        </SetupPanel>
      </>
    );
  return (
    <>
      <SetupProgress stages={setupStages} current="scope" />
      <SetupPanel
        stage={4}
        total={6}
        title="Choose what AI tools may use"
        description="Restrict the MCP to one vault folder, or allow the whole vault."
        back={() => props.setPage("security")}
        next={() => void props.configure()}
        nextLabel="Create LiveSync"
        nextDisabled={
          !props.connectionUrl ||
          props.vaultPassphrase.length < 12 ||
          props.vaultPassphrase !== props.vaultPassphraseAgain ||
          !props.otherSyncOff
        }
        busy={props.busy}
      >
        <label className="ss-field">
          Folder available to AI tools{" "}
          <span className="ss-field-help">Use / for the whole vault, or enter a folder such as Projects.</span>
          <input
            className="ss-input"
            value={props.scopePath}
            onChange={(event) => props.setScopePath(event.target.value)}
          />
        </label>
        <dl className="ss-details">
          <dt>Connection</dt>
          <dd>{props.accessMethod === "tailscale" ? "Private Tailscale" : "Public HTTPS"}</dd>
          <dt>Address</dt>
          <dd>{props.connectionUrl}</dd>
          <dt>AI-accessible folder</dt>
          <dd>{props.scopePath || "/"}</dd>
        </dl>
        <div className="ss-callout">
          <strong>Next:</strong> ScholarServer creates the private database, then gives you a one-time Obsidian setup
          link.
        </div>
      </SetupPanel>
    </>
  );
}

type DeviceProps = {
  onboarding: NonNullable<Status["liveSyncOnboarding"]>;
  busy: boolean;
  pluginConnected: boolean;
  setPluginConnected: (value: boolean) => void;
  copy: (value: string, label: string) => Promise<void>;
  complete: () => Promise<void>;
};
function LiveSyncDevice(props: DeviceProps) {
  return (
    <>
      <SetupProgress stages={setupStages} current="device" />
      <SetupPanel
        stage={5}
        total={6}
        title="Connect your first Obsidian device"
        description="Complete these steps on a computer with the vault open. ScholarServer waits until you confirm it is ready."
        next={() => void props.complete()}
        nextLabel="Connect ScholarServer"
        nextDisabled={!props.pluginConnected}
        busy={props.busy}
      >
        {props.onboarding.accessMethod === "tailscale" ? (
          <div className="ss-callout">
            <strong>Before you start:</strong> this computer must be signed into the same Tailscale network as
            ScholarServer.
          </div>
        ) : null}
        <ol className="ss-guide-list">
          <li>
            <strong>Install and enable Self-hosted LiveSync.</strong>
            <p>This is the community plugin named “Self-hosted LiveSync”.</p>
            <a className="ss-button ss-button-secondary" href="obsidian://show-plugin?id=obsidian-livesync">
              Open plugin in Obsidian
            </a>
          </li>
          <li>
            <strong>Open the one-time setup link.</strong>
            <p>It fills in the server and database settings for you.</p>
            <a className="ss-button" href={props.onboarding.setupURI}>
              Open setup link in Obsidian
            </a>
            <button
              className="ss-button ss-button-secondary"
              onClick={() => void props.copy(props.onboarding.setupURI, "Setup link")}
            >
              Copy setup link
            </button>
          </li>
          <li>
            <strong>Enter this one-time setup password.</strong>
            <div className="ss-secret-row">
              <code>{props.onboarding.setupPassphrase}</code>
              <button
                className="ss-button ss-button-secondary"
                onClick={() => void props.copy(props.onboarding.setupPassphrase, "Setup password")}
              >
                Copy
              </button>
            </div>
          </li>
          <li>
            <strong>Choose “I am setting up a new server for the first time”.</strong>
            <p>Wait until LiveSync reports that it is up to date.</p>
          </li>
        </ol>
        <label className="ss-check">
          <input
            type="checkbox"
            checked={props.pluginConnected}
            onChange={(event) => props.setPluginConnected(event.target.checked)}
          />
          <span>
            <strong>The plugin connected and LiveSync says it is up to date.</strong>
          </span>
        </label>
      </SetupPanel>
    </>
  );
}
