import { useCallback, useEffect, useState } from "react";

type RemoteVault = { id: string; name: string };
type Status = {
  state: "setup-required" | "vault-selection-required" | "initial-sync" | "ready";
  remoteVault: string | null;
  scopePath: string;
  lastSyncAt: string | null;
  lastError: string | null;
  workerRunning: boolean;
  vaults?: unknown;
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

function when(value: string | null): string {
  return value ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "Not yet";
}

export function App() {
  const [tab, setTab] = useState<Tab>(currentTab);
  const [status, setStatus] = useState<Status | null>(null);
  const [stage, setStage] = useState<Status["state"]>("setup-required");
  const [vaults, setVaults] = useState<RemoteVault[]>([]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mfa, setMfa] = useState("");
  const [vault, setVault] = useState("");
  const [encryptionPassword, setEncryptionPassword] = useState("");
  const [scopePath, setScopePath] = useState("/");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const next = await request<Status>("status");
      const nextVaults = normalizeVaults(next.vaults);
      setStatus(next); setStage(next.state); setScopePath(next.scopePath || "/");
      if (nextVaults.length) { setVaults(nextVaults); setVault((current) => current || nextVaults[0].id); }
      setError(null);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not inspect Obsidian"); }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    const pop = () => setTab(currentTab());
    window.addEventListener("popstate", pop);
    return () => window.removeEventListener("popstate", pop);
  }, []);

  const navigate = (next: Tab) => { window.history.pushState({}, "", `${base}/${next}`); setTab(next); };
  const run = async (operation: () => Promise<unknown>, success: string) => {
    setBusy(true); setError(null); setNotice(null);
    try { await operation(); setNotice(success); await refresh(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "The operation failed"); }
    finally { setBusy(false); }
  };

  const signIn = async () => {
    setBusy(true); setError(null); setNotice(null);
    try {
      const result = await request<Status>("account/login", { method: "POST", body: JSON.stringify({ email, password, ...(mfa ? { mfa } : {}) }) });
      const nextVaults = normalizeVaults(result.vaults);
      setVaults(nextVaults); setVault(nextVaults[0]?.id ?? ""); setPassword(""); setMfa(""); setStage("vault-selection-required");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not connect the account"); }
    finally { setBusy(false); }
  };

  const connectVault = () => run(async () => {
    await request<Status>("vault/connect", { method: "POST", body: JSON.stringify({ vault, scopePath: scopePath.trim() || "/", ...(encryptionPassword ? { encryptionPassword } : {}) }) });
    setEncryptionPassword("");
  }, "The vault is connected. Continuous two-way sync and the remote MCP are ready.");

  const restartSetup = () => {
    setEmail(""); setPassword(""); setMfa(""); setVaults([]); setVault(""); setEncryptionPassword("");
    setStage("setup-required"); setError(null); setNotice(null); setTab("configuration");
  };

  const ready = status?.state === "ready";
  return <div className="ss-app">
    <header className="ss-app-header"><div className="ss-app-header-inner">
      <div className="ss-brand"><div className="ss-brand-mark">S</div><div><p className="ss-brand-title">ScholarServer</p><p className="ss-brand-context">Obsidian</p></div></div>
      <a className="ss-button ss-button-secondary" href="/">Back to ScholarServer</a>
    </div></header>
    <main className="ss-main">
      <div className="ss-page-heading"><div><h1>Obsidian</h1><p>Keep a server copy of your vault synchronized and make the folder you choose available through the remote MCP.</p></div>{status ? <span className={`ss-badge ${ready ? "ss-badge-success" : "ss-badge-warning"}`}>{ready ? "Connected" : "Setup needed"}</span> : null}</div>
      <nav className="ss-tabs" aria-label="Obsidian sections">{tabs.map((item) => <button key={item.id} className="ss-tab" aria-selected={tab === item.id} onClick={() => navigate(item.id)}>{item.label}</button>)}</nav>
      {notice ? <div className="ss-alert ss-alert-success">{notice}</div> : null}
      {error ? <div className="ss-alert ss-alert-error" role="alert">{error}</div> : null}
      {!status ? <div className="ss-card ss-loading"><span className="ss-spinner" /> Loading Obsidian…</div> : null}

      {status && tab === "overview" ? <div className="ss-stack">
        <div className="ss-grid ss-grid-3">
          <div className="ss-card"><div className="ss-metric-label">Sync service</div><div className="ss-metric-value">{status.workerRunning ? "Running" : "Stopped"}</div></div>
          <div className="ss-card"><div className="ss-metric-label">Remote vault</div><div className="ss-metric-value">{status.remoteVault ?? "Not selected"}</div></div>
          <div className="ss-card"><div className="ss-metric-label">AI-accessible folder</div><div className="ss-metric-value"><code className="ss-code">{status.scopePath || "/"}</code></div></div>
        </div>
        <section className="ss-card"><div className="ss-toolbar"><div><h2>Vault connection</h2><p className="ss-card-description">The server replica stays synchronized using Obsidian Sync.</p></div><button className="ss-button ss-button-secondary" onClick={() => void refresh()}>Refresh</button></div><dl className="ss-details"><dt>State</dt><dd>{status.state}</dd><dt>Last connected sync</dt><dd>{when(status.lastSyncAt)}</dd><dt>MCP scope</dt><dd><code>{status.scopePath || "/"}</code></dd></dl></section>
        {!ready ? <section className="ss-card"><div className="ss-toolbar"><div><h2>Finish setup</h2><p className="ss-card-description">Connect an account and choose the remote vault before notes can be used.</p></div><button className="ss-button" onClick={() => navigate("configuration")}>Continue setup</button></div></section> : null}
      </div> : null}

      {status && tab === "configuration" ? <div className="ss-stack">
        <div className="ss-steps"><div className={`ss-step ${stage === "setup-required" ? "ss-step-active" : ""}`}><strong>1. Account</strong>Use your Obsidian Sync account once.</div><div className={`ss-step ${stage === "vault-selection-required" || stage === "initial-sync" ? "ss-step-active" : ""}`}><strong>2. Vault</strong>Choose a vault and MCP folder.</div><div className={`ss-step ${stage === "ready" ? "ss-step-active" : ""}`}><strong>3. Continuous sync</strong>ScholarServer maintains its replica.</div></div>
        {stage === "setup-required" ? <section className="ss-card ss-stack"><div><h2>Connect Obsidian Sync</h2><p className="ss-card-description">Your password and MFA code are passed directly to Obsidian Headless and are not saved by ScholarServer.</p></div><label className="ss-field">Account email<input className="ss-input" type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} /></label><label className="ss-field">Password<input className="ss-input" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} /></label><label className="ss-field">MFA code <span className="ss-field-help">Leave blank if your account does not use MFA.</span><input className="ss-input" inputMode="numeric" autoComplete="one-time-code" value={mfa} onChange={(event) => setMfa(event.target.value)} /></label><div className="ss-callout">Nothing entered here is written to Compose, an environment file, or ScholarServer's database.</div><div><button className="ss-button" disabled={busy || !email || !password} onClick={() => void signIn()}>{busy ? <span className="ss-spinner" /> : null}Connect account</button></div></section> : null}
        {stage === "vault-selection-required" || stage === "initial-sync" ? <section className="ss-card ss-stack"><div><h2>Select the server vault</h2><p className="ss-card-description">The first sync is download-only. Two-way sync starts only after that pull succeeds.</p></div><label className="ss-field">Remote vault<select className="ss-input" value={vault} onChange={(event) => setVault(event.target.value)}>{vaults.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className="ss-field">Vault encryption password <span className="ss-field-help">Needed only for an end-to-end encrypted vault.</span><input className="ss-input" type="password" value={encryptionPassword} onChange={(event) => setEncryptionPassword(event.target.value)} /></label><label className="ss-field">Folder available to AI tools <span className="ss-field-help">Use / for the whole vault, or a path such as ScholarServer to restrict access.</span><input className="ss-input" value={scopePath} onChange={(event) => setScopePath(event.target.value)} /></label><div className="ss-form-actions"><button className="ss-button ss-button-secondary" disabled={busy} onClick={restartSetup}>Sign in again</button><button className="ss-button" disabled={busy || !vault} onClick={() => void connectVault()}>{busy ? <span className="ss-spinner" /> : null}Download and connect vault</button></div></section> : null}
        {stage === "ready" ? <section className="ss-card"><div className="ss-toolbar"><div><h2>Obsidian is connected</h2><p className="ss-card-description">Continuous sync is active. Reconfiguration lets you replace the account or vault.</p></div><button className="ss-button ss-button-secondary" onClick={restartSetup}>Change account or vault</button></div></section> : null}
      </div> : null}
    </main>
  </div>;
}
