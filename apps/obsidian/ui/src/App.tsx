import { useCallback, useEffect, useState } from "react";

type RemoteVault = { id: string; name: string };
type SyncProfile = "none" | "official" | "livesync";
type LiveSyncAccessMethod = "tailscale" | "public";
type Status = {
  state: "setup-required" | "vault-selection-required" | "initial-sync" | "livesync-preparing" | "livesync-device-setup" | "livesync-server-joining" | "ready";
  profile: SyncProfile;
  remoteVault: string | null;
  scopePath: string;
  lastSyncAt: string | null;
  lastError: string | null;
  workerRunning: boolean;
  vaults?: unknown;
  liveSyncWorker?: { state: string; running: boolean; activeRevision?: number | null; lastError: string | null } | null;
  liveSyncOnboarding?: { accessMethod: LiveSyncAccessMethod; connectionUrl: string; setupURI: string; setupPassphrase: string } | null;
};
type Tab = "overview" | "configuration";

const tabs: Array<{ id: Tab; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "configuration", label: "Configuration" }
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
  const result = await response.json().catch(() => null) as T | { error?: string } | null;
  if (!response.ok) throw new Error((result as { error?: string } | null)?.error ?? "Obsidian request failed");
  return result as T;
}

function currentTab(): Tab {
  const value = window.location.pathname.split("/").filter(Boolean).at(-1);
  return tabs.some((tab) => tab.id === value) ? value as Tab : "overview";
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
  const [connectionUrl, setConnectionUrl] = useState(() => window.location.hostname.endsWith(".ts.net") ? `https://${window.location.hostname}:8443` : "");
  const [vaultPassphrase, setVaultPassphrase] = useState("");
  const [vaultPassphraseAgain, setVaultPassphraseAgain] = useState("");
  const [otherSyncOff, setOtherSyncOff] = useState(false);
  const [pluginConnected, setPluginConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const next = await request<Status>("status");
      const nextVaults = normalizeVaults(next.vaults);
      setStatus(next); setScopePath(next.scopePath || "/");
      if (nextVaults.length) { setVaults(nextVaults); setVault((current) => current || nextVaults[0].id); }
      setError(null);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not inspect Obsidian"); }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);
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

  const navigate = (next: Tab) => { window.history.pushState({}, "", `${base}/${next}`); setTab(next); };
  const run = async (operation: () => Promise<unknown>, success?: string) => {
    setBusy(true); setError(null); setNotice(null);
    try { await operation(); if (success) setNotice(success); await refresh(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "The operation failed"); }
    finally { setBusy(false); }
  };

  const chooseProfile = (profile: Exclude<SyncProfile, "none">) => run(
    () => request("profile/select", { method: "POST", body: JSON.stringify({ profile }) })
  );

  const signIn = async () => {
    setBusy(true); setError(null); setNotice(null);
    try {
      const result = await request<Status>("account/login", { method: "POST", body: JSON.stringify({ email, password, ...(mfa ? { mfa } : {}) }) });
      const nextVaults = normalizeVaults(result.vaults);
      setVaults(nextVaults); setVault(nextVaults[0]?.id ?? ""); setPassword(""); setMfa(""); await refresh();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not connect the account"); }
    finally { setBusy(false); }
  };

  const connectVault = () => run(async () => {
    await request("vault/connect", { method: "POST", body: JSON.stringify({ vault, scopePath: scopePath.trim() || "/", ...(encryptionPassword ? { encryptionPassword } : {}) }) });
    setEncryptionPassword("");
  }, "The vault is connected. Continuous two-way sync and the remote MCP are ready.");

  const configureLiveSync = () => run(async () => {
    if (vaultPassphrase !== vaultPassphraseAgain) throw new Error("The two vault encryption passphrases do not match");
    await request("livesync/configure", {
      method: "POST",
      body: JSON.stringify({ accessMethod: liveSyncAccess, connectionUrl, vaultPassphrase, scopePath: scopePath.trim() || "/", confirmedNoOtherSync: otherSyncOff })
    });
    setVaultPassphrase(""); setVaultPassphraseAgain("");
  });

  const completeLiveSync = () => run(
    () => request("livesync/complete", { method: "POST", body: JSON.stringify({ confirmedPluginConnected: pluginConnected }) })
  );

  const copy = async (value: string, label: string) => {
    await navigator.clipboard.writeText(value);
    setNotice(`${label} copied.`);
  };

  const ready = status?.state === "ready";
  const liveSyncRunning = Boolean(status?.liveSyncWorker?.running);
  return <div className="ss-app">
    <header className="ss-app-header"><div className="ss-app-header-inner">
      <div className="ss-brand"><div className="ss-brand-mark">S</div><div><p className="ss-brand-title">ScholarServer</p><p className="ss-brand-context">Obsidian</p></div></div>
      <a className="ss-button ss-button-secondary" href="/">Back to ScholarServer</a>
    </div></header>
    <main className="ss-main">
      <div className="ss-page-heading"><div><h1>Obsidian</h1><p>Keep a server copy of your vault synchronized and choose which folder AI tools may use.</p></div>{status ? <span className={`ss-badge ${ready ? "ss-badge-success" : "ss-badge-warning"}`}>{ready ? "Connected" : "Setup needed"}</span> : null}</div>
      <nav className="ss-tabs" aria-label="Obsidian sections">{tabs.map((item) => <button key={item.id} className="ss-tab" aria-selected={tab === item.id} onClick={() => navigate(item.id)}>{item.label}</button>)}</nav>
      {notice ? <div className="ss-alert ss-alert-success">{notice}</div> : null}
      {error ? <div className="ss-alert ss-alert-error" role="alert">{error}</div> : null}
      {!status ? <div className="ss-card ss-loading"><span className="ss-spinner" /> Loading Obsidian…</div> : null}

      {status && tab === "overview" ? <div className="ss-stack">
        <div className="ss-grid ss-grid-3">
          <div className="ss-card"><div className="ss-metric-label">Sync method</div><div className="ss-metric-value">{profileLabel(status.profile)}</div></div>
          <div className="ss-card"><div className="ss-metric-label">Server sync</div><div className="ss-metric-value">{status.profile === "livesync" ? (liveSyncRunning ? "Running" : "Starting") : (status.workerRunning ? "Running" : "Stopped")}</div></div>
          <div className="ss-card"><div className="ss-metric-label">AI-accessible folder</div><div className="ss-metric-value"><code className="ss-code">{status.scopePath || "/"}</code></div></div>
        </div>
        <section className="ss-card"><div className="ss-toolbar"><div><h2>Vault connection</h2><p className="ss-card-description">{ready ? `Your server replica uses ${profileLabel(status.profile)}.` : "Choose and connect a sync method to begin."}</p></div><button className="ss-button ss-button-secondary" onClick={() => void refresh()}>Refresh</button></div>{status.liveSyncWorker?.lastError ? <div className="ss-alert ss-alert-error">{status.liveSyncWorker.lastError}</div> : null}</section>
        {!ready ? <section className="ss-card"><div className="ss-toolbar"><div><h2>Finish setup</h2><p className="ss-card-description">ScholarServer will guide you through the safe steps.</p></div><button className="ss-button" onClick={() => navigate("configuration")}>Continue setup</button></div></section> : null}
      </div> : null}

      {status && tab === "configuration" ? <div className="ss-stack">
        {status.profile === "none" ? <ProfileChoice busy={busy} choose={chooseProfile} /> : null}
        {status.profile === "official" && status.state === "setup-required" ? <OfficialLogin busy={busy} values={{ email, password, mfa }} setters={{ setEmail, setPassword, setMfa }} signIn={signIn} /> : null}
        {status.profile === "official" && (status.state === "vault-selection-required" || status.state === "initial-sync") ? <OfficialVault busy={busy} vaults={vaults} vault={vault} setVault={setVault} encryptionPassword={encryptionPassword} setEncryptionPassword={setEncryptionPassword} scopePath={scopePath} setScopePath={setScopePath} connect={connectVault} /> : null}
        {status.profile === "livesync" && status.state === "setup-required" ? <LiveSyncPrepare busy={busy} accessMethod={liveSyncAccess} setAccessMethod={setLiveSyncAccess} connectionUrl={connectionUrl} setConnectionUrl={setConnectionUrl} vaultPassphrase={vaultPassphrase} setVaultPassphrase={setVaultPassphrase} vaultPassphraseAgain={vaultPassphraseAgain} setVaultPassphraseAgain={setVaultPassphraseAgain} scopePath={scopePath} setScopePath={setScopePath} otherSyncOff={otherSyncOff} setOtherSyncOff={setOtherSyncOff} configure={configureLiveSync} /> : null}
        {status.profile === "livesync" && status.state === "livesync-preparing" ? <section className="ss-card ss-loading"><span className="ss-spinner" /><div><h2>Preparing LiveSync</h2><p className="ss-card-description">ScholarServer is starting CouchDB and creating your encrypted vault database.</p></div></section> : null}
        {status.profile === "livesync" && status.state === "livesync-device-setup" && status.liveSyncOnboarding ? <LiveSyncDevice onboarding={status.liveSyncOnboarding} busy={busy} pluginConnected={pluginConnected} setPluginConnected={setPluginConnected} copy={copy} complete={completeLiveSync} /> : null}
        {status.profile === "livesync" && status.state === "livesync-server-joining" ? <section className="ss-card ss-loading"><span className="ss-spinner" /><div><h2>Connecting your server copy</h2><p className="ss-card-description">Your first device is ready. ScholarServer is now downloading the vault safely; this page updates automatically.</p>{status.lastError ? <div className="ss-alert ss-alert-error">{status.lastError}</div> : null}</div></section> : null}
        {status.state === "ready" ? <section className="ss-card"><div className="ss-toolbar"><div><h2>Obsidian is connected</h2><p className="ss-card-description">{profileLabel(status.profile)} is active. Keep other sync methods off when using LiveSync.</p></div><button className="ss-button ss-button-secondary" onClick={() => void refresh()}>Check connection</button></div></section> : null}
      </div> : null}
    </main>
  </div>;
}

function ProfileChoice({ busy, choose }: { busy: boolean; choose: (profile: "official" | "livesync") => Promise<void> }) {
  return <><div className="ss-steps"><div className="ss-step ss-step-active"><strong>1. Choose sync</strong>Pick the method that fits you.</div><div className="ss-step"><strong>2. Connect</strong>Follow a short guided setup.</div><div className="ss-step"><strong>3. Ready</strong>ScholarServer keeps a server copy.</div></div><section className="ss-card ss-stack"><div><h2>How should this vault sync?</h2><p className="ss-card-description">Only one method may control a vault at a time.</p></div><div className="ss-choice-grid"><button className="ss-choice-card" disabled={busy} onClick={() => void choose("livesync")}><strong>Self-hosted LiveSync</strong><span className="ss-badge ss-badge-success">Free</span><p>Your notes sync through this ScholarServer. Install one free plugin on each device.</p></button><button className="ss-choice-card" disabled={busy} onClick={() => void choose("official")}><strong>Obsidian Sync</strong><span className="ss-badge">Paid account</span><p>The official option. ScholarServer signs in once and keeps its own replica.</p></button></div></section></>;
}

function OfficialLogin({ busy, values, setters, signIn }: { busy: boolean; values: { email: string; password: string; mfa: string }; setters: { setEmail: (value: string) => void; setPassword: (value: string) => void; setMfa: (value: string) => void }; signIn: () => Promise<void> }) {
  return <section className="ss-card ss-stack"><div><h2>Connect Obsidian Sync</h2><p className="ss-card-description">Your password and MFA code go directly to Obsidian Headless and are not saved.</p></div><label className="ss-field">Account email<input className="ss-input" type="email" autoComplete="username" value={values.email} onChange={(event) => setters.setEmail(event.target.value)} /></label><label className="ss-field">Password<input className="ss-input" type="password" autoComplete="current-password" value={values.password} onChange={(event) => setters.setPassword(event.target.value)} /></label><label className="ss-field">MFA code <span className="ss-field-help">Leave blank if you do not use MFA.</span><input className="ss-input" inputMode="numeric" autoComplete="one-time-code" value={values.mfa} onChange={(event) => setters.setMfa(event.target.value)} /></label><div><button className="ss-button" disabled={busy || !values.email || !values.password} onClick={() => void signIn()}>{busy ? <span className="ss-spinner" /> : null}Connect account</button></div></section>;
}

function OfficialVault({ busy, vaults, vault, setVault, encryptionPassword, setEncryptionPassword, scopePath, setScopePath, connect }: { busy: boolean; vaults: RemoteVault[]; vault: string; setVault: (value: string) => void; encryptionPassword: string; setEncryptionPassword: (value: string) => void; scopePath: string; setScopePath: (value: string) => void; connect: () => Promise<void> }) {
  return <section className="ss-card ss-stack"><div><h2>Select the server vault</h2><p className="ss-card-description">The first sync is download-only. Two-way sync starts only after it succeeds.</p></div><label className="ss-field">Remote vault<select className="ss-input" value={vault} onChange={(event) => setVault(event.target.value)}>{vaults.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className="ss-field">Vault encryption password<input className="ss-input" type="password" value={encryptionPassword} onChange={(event) => setEncryptionPassword(event.target.value)} /></label><label className="ss-field">Folder available to AI tools <span className="ss-field-help">Use / for the whole vault, or a folder name to limit access.</span><input className="ss-input" value={scopePath} onChange={(event) => setScopePath(event.target.value)} /></label><div><button className="ss-button" disabled={busy || !vault} onClick={() => void connect()}>{busy ? <span className="ss-spinner" /> : null}Download and connect vault</button></div></section>;
}

type PrepareProps = { busy: boolean; accessMethod: LiveSyncAccessMethod; setAccessMethod: (value: LiveSyncAccessMethod) => void; connectionUrl: string; setConnectionUrl: (value: string) => void; vaultPassphrase: string; setVaultPassphrase: (value: string) => void; vaultPassphraseAgain: string; setVaultPassphraseAgain: (value: string) => void; scopePath: string; setScopePath: (value: string) => void; otherSyncOff: boolean; setOtherSyncOff: (value: boolean) => void; configure: () => Promise<void> };
function LiveSyncPrepare(props: PrepareProps) {
  const choose = (method: LiveSyncAccessMethod) => {
    props.setAccessMethod(method);
    if (method === "tailscale" && window.location.hostname.endsWith(".ts.net")) props.setConnectionUrl(`https://${window.location.hostname}:8443`);
    if (method === "public" && props.connectionUrl.includes(".ts.net")) props.setConnectionUrl("");
  };
  return <><div className="ss-steps"><div className="ss-step ss-step-active"><strong>1. Prepare</strong>Choose how your devices connect.</div><div className="ss-step"><strong>2. Obsidian</strong>Install and connect the plugin.</div><div className="ss-step"><strong>3. Ready</strong>Sync on all devices.</div></div><section className="ss-card ss-stack"><div><h2>How should your devices reach LiveSync?</h2><p className="ss-card-description">Both choices keep the vault encrypted. You can change the connection method later.</p></div><div className="ss-choice-grid" role="radiogroup" aria-label="LiveSync access method"><button type="button" role="radio" aria-checked={props.accessMethod === "tailscale"} className={`ss-choice-card ${props.accessMethod === "tailscale" ? "ss-choice-card-selected" : ""}`} onClick={() => choose("tailscale")}><strong>Private with Tailscale</strong><span className="ss-badge ss-badge-success">Recommended</span><p>Nothing is exposed to the public internet. Install Tailscale on every device that uses this vault.</p></button><button type="button" role="radio" aria-checked={props.accessMethod === "public"} className={`ss-choice-card ${props.accessMethod === "public" ? "ss-choice-card-selected" : ""}`} onClick={() => choose("public")}><strong>Public HTTPS</strong><span className="ss-badge">More compatible</span><p>Works without Tailscale. Requires a domain and Cloudflare or direct HTTPS, with a larger public surface.</p></button></div>{props.accessMethod === "tailscale" ? <div className="ss-callout"><strong>Private access:</strong> only devices signed into your Tailscale network can connect.</div> : <div className="ss-callout"><strong>Public access:</strong> finish the LiveSync hostname in ScholarServer Access first. The database still requires its generated account and vault encryption.</div>}<label className="ss-field">LiveSync address <span className="ss-field-help">{props.accessMethod === "tailscale" ? "The private .ts.net address shown by ScholarServer." : "The public HTTPS hostname you configured."}</span><input className="ss-input" type="url" placeholder={props.accessMethod === "tailscale" ? "https://your-server.example.ts.net:8443" : "https://notes-sync.example.com"} value={props.connectionUrl} onChange={(event) => props.setConnectionUrl(event.target.value)} /></label><label className="ss-field">Vault encryption passphrase <span className="ss-field-help">Save this in your password manager.</span><input className="ss-input" type="password" autoComplete="new-password" value={props.vaultPassphrase} onChange={(event) => props.setVaultPassphrase(event.target.value)} /></label><label className="ss-field">Repeat vault encryption passphrase<input className="ss-input" type="password" autoComplete="new-password" value={props.vaultPassphraseAgain} onChange={(event) => props.setVaultPassphraseAgain(event.target.value)} /></label><label className="ss-field">Folder available to AI tools<input className="ss-input" value={props.scopePath} onChange={(event) => props.setScopePath(event.target.value)} /></label><label className="ss-check"><input type="checkbox" checked={props.otherSyncOff} onChange={(event) => props.setOtherSyncOff(event.target.checked)} /><span><strong>I have turned off every other sync method for this vault.</strong><small>Turn off Obsidian Sync, iCloud, Git sync, Syncthing, and similar tools. Two sync engines can corrupt a vault.</small></span></label><div><button className="ss-button" disabled={props.busy || !props.connectionUrl || props.vaultPassphrase.length < 12 || !props.otherSyncOff} onClick={() => void props.configure()}>{props.busy ? <span className="ss-spinner" /> : null}Create LiveSync</button></div></section></>;
}

type DeviceProps = { onboarding: NonNullable<Status["liveSyncOnboarding"]>; busy: boolean; pluginConnected: boolean; setPluginConnected: (value: boolean) => void; copy: (value: string, label: string) => Promise<void>; complete: () => Promise<void> };
function LiveSyncDevice(props: DeviceProps) {
  return <><div className="ss-steps"><div className="ss-step"><strong>1. Prepare</strong>LiveSync is ready.</div><div className="ss-step ss-step-active"><strong>2. Obsidian</strong>Connect this device.</div><div className="ss-step"><strong>3. Ready</strong>ScholarServer joins safely.</div></div><section className="ss-card ss-stack"><div><h2>Connect Obsidian</h2><p className="ss-card-description">Do these steps on a computer with your vault open. ScholarServer will wait until you finish.</p></div>{props.onboarding.accessMethod === "tailscale" ? <div className="ss-callout"><strong>First, check Tailscale.</strong> This device must be signed into the same Tailscale network as ScholarServer.</div> : null}<dl className="ss-details"><dt>Connection</dt><dd>{props.onboarding.accessMethod === "tailscale" ? "Private Tailscale" : "Public HTTPS"}</dd><dt>Address</dt><dd>{props.onboarding.connectionUrl}</dd></dl><ol className="ss-guide-list"><li><strong>Install Self-hosted LiveSync.</strong><p>Install the community plugin, then enable it.</p><a className="ss-button ss-button-secondary" href="obsidian://show-plugin?id=obsidian-livesync">Open plugin in Obsidian</a></li><li><strong>Apply your settings.</strong><p>The encrypted link configures the plugin.</p><a className="ss-button" href={props.onboarding.setupURI}>Open setup link in Obsidian</a><button className="ss-button ss-button-secondary" onClick={() => void props.copy(props.onboarding.setupURI, "Setup link")}>Copy setup link</button></li><li><strong>Enter the one-time setup password.</strong><p>This is the passphrase requested in the window shown in your screenshot.</p><div className="ss-secret-row"><code>{props.onboarding.setupPassphrase}</code><button className="ss-button ss-button-secondary" onClick={() => void props.copy(props.onboarding.setupPassphrase, "Setup password")}>Copy</button></div></li><li><strong>Make this device the first copy.</strong><p>Test the connection, choose “I am setting up a new server for the first time”, then wait until LiveSync says it is up to date.</p></li></ol><div className="ss-alert ss-alert-warning"><strong>Do not turn another sync tool back on for this vault.</strong> On another device, install the plugin and create a fresh Setup URI from the first working device.</div><label className="ss-check"><input type="checkbox" checked={props.pluginConnected} onChange={(event) => props.setPluginConnected(event.target.checked)} /><span><strong>The plugin tested successfully and the vault is up to date.</strong></span></label><div><button className="ss-button" disabled={props.busy || !props.pluginConnected} onClick={() => void props.complete()}>{props.busy ? <span className="ss-spinner" /> : null}Connect ScholarServer</button></div></section></>;
}
