import { useCallback, useEffect, useState } from "react";
import { AutomationsTab } from "./AutomationsTab";

type Status = {
  state: string; desktop: string; version: string | null; localApi: string;
  storageMode: string | null; accountConnected: boolean; userId: string | null;
  username: string | null; downloadMode: string | null; groupFileSync: boolean;
  linkedFolder: string | null; linkedFolderAutomation: boolean; storageVerified: boolean;
  syncInProgress: boolean; lastError: string | null;
};
type Tab = "overview" | "attachments" | "automations" | "configuration";
type StorageMode = "zotero-storage" | "webdav" | "linked-folder" | "server-only";

const tabs: Array<{ id: Tab; label: string }> = [
  { id: "overview", label: "Overview" }, { id: "attachments", label: "Attachments" }, { id: "automations", label: "Automations" }, { id: "configuration", label: "Configuration" }
];
const storageOptions: Array<{ value: StorageMode; title: string; detail: string }> = [
  { value: "zotero-storage", title: "Zotero Storage", detail: "The simplest option. Zotero synchronizes references and attachments." },
  { value: "webdav", title: "WebDAV", detail: "Use a WebDAV account for personal-library attachments while Zotero syncs the references." },
  { value: "linked-folder", title: "Shared folder with ZotMoov", detail: "Keep linked PDFs in external storage shared with your other computers." },
  { value: "server-only", title: "References only", detail: "Synchronize the library database without downloading attachment files." }
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
  if (!response.ok) throw new Error((result as { error?: string } | null)?.error ?? "Zotero request failed");
  return result as T;
}

function currentTab(): Tab {
  const relative = base && window.location.pathname.startsWith(base)
    ? window.location.pathname.slice(base.length)
    : window.location.pathname;
  const value = relative.split("/").filter(Boolean)[0];
  return tabs.some((tab) => tab.id === value) ? value as Tab : "overview";
}
function storageName(value: string | null) { return storageOptions.find((item) => item.value === value)?.title ?? value ?? "Not configured"; }

export function App() {
  const [tab, setTab] = useState<Tab>(currentTab);
  const [status, setStatus] = useState<Status | null>(null);
  const [storageMode, setStorageMode] = useState<StorageMode>("zotero-storage");
  const [downloadMode, setDownloadMode] = useState("on-demand");
  const [groupFileSync, setGroupFileSync] = useState(true);
  const [webdavUrl, setWebdavUrl] = useState("");
  const [webdavUsername, setWebdavUsername] = useState("");
  const [webdavPassword, setWebdavPassword] = useState("");
  const [authorizationUrl, setAuthorizationUrl] = useState<string | null>(null);
  const [checkingAccount, setCheckingAccount] = useState(false);
  const [attachmentKey, setAttachmentKey] = useState("");
  const [sourcePath, setSourcePath] = useState("");
  const [attachmentResult, setAttachmentResult] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const next = await request<Status>("status");
      setStatus(next);
      if (storageOptions.some((item) => item.value === next.storageMode)) setStorageMode(next.storageMode as StorageMode);
      if (next.downloadMode === "on-sync" || next.downloadMode === "on-demand") setDownloadMode(next.downloadMode);
      setGroupFileSync(next.groupFileSync);
      setError(null);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not inspect Zotero"); }
  }, []);

  useEffect(() => { void refresh(); const timer = window.setInterval(() => void refresh(), 5000); return () => window.clearInterval(timer); }, [refresh]);
  useEffect(() => {
    const pop = () => setTab(currentTab());
    window.addEventListener("popstate", pop);
    return () => window.removeEventListener("popstate", pop);
  }, []);
  useEffect(() => {
    if (!checkingAccount) return;
    let cancelled = false;
    const check = async () => {
      try {
        const result = await request<Status>("account/complete", { method: "POST" });
        if (cancelled) return;
        if (result.state === "account-authorization-pending") return void window.setTimeout(check, 2500);
        setCheckingAccount(false); setAuthorizationUrl(null); setStatus(result); setNotice("Your Zotero account is connected.");
      } catch (caught) {
        if (!cancelled) { setCheckingAccount(false); setError(caught instanceof Error ? caught.message : "Could not finish Zotero account linking"); }
      }
    };
    const timer = window.setTimeout(check, 1500);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [checkingAccount]);

  const navigate = (next: Tab) => { window.history.pushState({}, "", `${base}/${next}`); setTab(next); };
  const run = async <T,>(operation: () => Promise<T>, success: string, result?: (value: T) => void) => {
    setBusy(true); setError(null); setNotice(null);
    try { const value = await operation(); result?.(value); setNotice(success); await refresh(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "The operation failed"); }
    finally { setBusy(false); }
  };
  const connectAccount = async () => {
    setBusy(true); setError(null); setNotice(null);
    const popup = window.open("about:blank", "_blank");
    try {
      const result = await request<{ loginUrl: string }>("account/start", { method: "POST" });
      if (!result.loginUrl || new URL(result.loginUrl).protocol !== "https:") throw new Error("Zotero returned an invalid sign-in address");
      setAuthorizationUrl(result.loginUrl); if (popup) popup.location.replace(result.loginUrl); setCheckingAccount(true);
    } catch (caught) { popup?.close(); setError(caught instanceof Error ? caught.message : "Could not start Zotero account linking"); }
    finally { setBusy(false); }
  };
  const saveStorage = () => run(() => storageMode === "webdav"
    ? request<Status>("storage/webdav", { method: "POST", body: JSON.stringify({ url: webdavUrl, username: webdavUsername, password: webdavPassword, downloadMode, groupFileSync }) })
    : request<Status>("storage", { method: "POST", body: JSON.stringify({ storageMode, downloadMode, groupFileSync }) }),
  "Attachment storage settings were saved.", () => setWebdavPassword(""));
  const ready = status?.state === "ready";

  return <div className="ss-app">
    <header className="ss-app-header"><div className="ss-app-header-inner"><div className="ss-brand"><div className="ss-brand-mark">S</div><div><p className="ss-brand-title">ScholarServer</p><p className="ss-brand-context">Zotero</p></div></div><a className="ss-button ss-button-secondary" href="/">Back to ScholarServer</a></div></header>
    <main className="ss-main">
      <div className="ss-page-heading"><div><h1>Zotero</h1><p>Manage your reference library, attachment storage, desktop authorization, and remote Zotero MCP.</p></div>{status ? <span className={`ss-badge ${ready ? "ss-badge-success" : status.desktop === "available" ? "ss-badge-warning" : "ss-badge-error"}`}>{ready ? "Ready" : status.desktop === "available" ? "Setup needed" : "Desktop unavailable"}</span> : null}</div>
      <nav className="ss-tabs" aria-label="Zotero sections">{tabs.map((item) => <button key={item.id} className="ss-tab" aria-selected={tab === item.id} onClick={() => navigate(item.id)}>{item.label}</button>)}</nav>
      {notice ? <div className="ss-alert ss-alert-success">{notice}</div> : null}
      {error ? <div className="ss-alert ss-alert-error" role="alert">{error}</div> : null}
      {!status ? <div className="ss-card ss-loading"><span className="ss-spinner" /> Loading Zotero…</div> : null}

      {status && tab === "overview" ? <div className="ss-stack">
        <div className="ss-grid ss-grid-3"><div className="ss-card"><div className="ss-metric-label">Zotero desktop</div><div className="ss-metric-value">{status.desktop}</div></div><div className="ss-card"><div className="ss-metric-label">Account</div><div className="ss-metric-value">{status.username ?? status.userId ?? "Not connected"}</div></div><div className="ss-card"><div className="ss-metric-label">Attachment storage</div><div className="ss-metric-value">{storageName(status.storageMode)}</div></div></div>
        <section className="ss-card"><div className="ss-toolbar"><div><h2>Library connection</h2><p className="ss-card-description">Zotero runs privately on this server; ScholarServer talks to its supported local API.</p></div><button className="ss-button ss-button-secondary" onClick={() => void refresh()}>Refresh</button></div><dl className="ss-details"><dt>Setup state</dt><dd>{status.state}</dd><dt>Zotero version</dt><dd>{status.version ?? "Unknown"}</dd><dt>Local API</dt><dd>{status.localApi}</dd><dt>File downloads</dt><dd>{status.downloadMode ?? "Not configured"}</dd>{status.storageMode === "linked-folder" ? <><dt>Shared folder</dt><dd>{status.linkedFolder ?? "/linked"}</dd><dt>ZotMoov automation</dt><dd>{status.linkedFolderAutomation ? "Enabled" : "Needs attention"}</dd></> : null}</dl></section>
        <section className="ss-card"><div className="ss-toolbar"><div><h2>{ready ? "Synchronization" : "Setup is incomplete"}</h2><p className="ss-card-description">{ready ? "Start an immediate library sync when you need one." : "Complete the guided account, storage, and authorization steps."}</p></div>{ready ? <button className="ss-button" disabled={busy || status.syncInProgress} onClick={() => void run(() => request<Status>("sync", { method: "POST" }), "Zotero synchronization completed.")}>{busy || status.syncInProgress ? <span className="ss-spinner" /> : null}Sync now</button> : <button className="ss-button" onClick={() => navigate("configuration")}>Continue setup</button>}</div></section>
      </div> : null}

      {status && tab === "attachments" ? <div className="ss-grid ss-grid-3">
        <section className="ss-card ss-stack"><div><h2>Resolve an attachment</h2><p className="ss-card-description">Confirm that a Zotero attachment key resolves to a safe local file.</p></div><label className="ss-field">Attachment key<input className="ss-input" maxLength={8} placeholder="ABCD1234" value={attachmentKey} onChange={(event) => setAttachmentKey(event.target.value.toUpperCase())} /></label><button className="ss-button" disabled={busy || !/^[A-Z0-9]{8}$/.test(attachmentKey)} onClick={() => void run(() => request<unknown>("attachments/resolve", { method: "POST", body: JSON.stringify({ attachmentKey }) }), "Attachment resolved.", setAttachmentResult)}>Resolve</button></section>
        <section className="ss-card ss-stack"><div><h2>Match a shared file</h2><p className="ss-card-description">Find the Zotero attachment corresponding to a path inside the linked research folder.</p></div><label className="ss-field">Relative file path<input className="ss-input" placeholder="Papers/example.pdf" value={sourcePath} onChange={(event) => setSourcePath(event.target.value)} /></label><button className="ss-button" disabled={busy || !sourcePath.trim()} onClick={() => void run(() => request<unknown>("attachments/match", { method: "POST", body: JSON.stringify({ sourcePath }) }), "Attachment matching completed.", setAttachmentResult)}>Find match</button></section>
        <section className="ss-card"><h2>Result</h2><p className="ss-card-description">Diagnostic metadata is shown without exposing the server file path.</p>{attachmentResult ? <pre className="ss-result ss-code">{JSON.stringify(attachmentResult, null, 2)}</pre> : <p className="ss-muted">No attachment checked yet.</p>}</section>
      </div> : null}

      {status && tab === "automations" ? <AutomationsTab base={base} request={request} setNotice={setNotice} setError={setError} /> : null}

      {status && tab === "configuration" ? <div className="ss-stack">
        <section className="ss-card ss-stack"><div className="ss-toolbar"><div><h2>1. Zotero account</h2><p className="ss-card-description">Sign in on Zotero's website. ScholarServer never receives your Zotero password.</p></div>{status.accountConnected ? <span className="ss-badge ss-badge-success">Connected</span> : null}</div>{status.accountConnected ? <div className="ss-callout">Connected as <strong>{status.username ?? status.userId}</strong>. Zotero stores its own account token.</div> : <><div className="ss-form-actions"><button className="ss-button" disabled={busy || checkingAccount} onClick={() => void connectAccount()}>{busy || checkingAccount ? <span className="ss-spinner" /> : null}{checkingAccount ? "Waiting for approval…" : "Connect Zotero account"}</button>{authorizationUrl ? <a className="ss-button ss-button-secondary" href={authorizationUrl} target="_blank" rel="noreferrer">Open Zotero sign-in</a> : null}</div></>}</section>
        <section className="ss-card ss-stack"><div><h2>2. Attachment storage</h2><p className="ss-card-description">Choose independently how the server obtains attachment files.</p></div><label className="ss-field">Storage profile<select className="ss-input" value={storageMode} onChange={(event) => { const next = event.target.value as StorageMode; setStorageMode(next); setGroupFileSync(next === "zotero-storage"); }} disabled={!status.accountConnected}>{storageOptions.map((option) => <option key={option.value} value={option.value}>{option.title}</option>)}</select><span className="ss-field-help ss-storage-description">{storageOptions.find((option) => option.value === storageMode)?.detail}</span></label>
          {storageMode === "webdav" ? <><label className="ss-field">WebDAV URL<input className="ss-input" type="url" placeholder="https://dav.example.org/zotero" value={webdavUrl} onChange={(event) => setWebdavUrl(event.target.value)} /></label><label className="ss-field">WebDAV username<input className="ss-input" autoComplete="username" value={webdavUsername} onChange={(event) => setWebdavUsername(event.target.value)} /></label><label className="ss-field">WebDAV password <span className="ss-field-help">Sent directly to Zotero's credential store and discarded after configuration.</span><input className="ss-input" type="password" autoComplete="current-password" value={webdavPassword} onChange={(event) => setWebdavPassword(event.target.value)} /></label></> : null}
          {storageMode !== "server-only" && storageMode !== "linked-folder" ? <label className="ss-field">Download attachments<select className="ss-input" value={downloadMode} onChange={(event) => setDownloadMode(event.target.value)}><option value="on-demand">When opened — saves server disk space</option><option value="on-sync">During every sync — keeps a complete local copy</option></select></label> : null}
          {storageMode === "zotero-storage" || storageMode === "webdav" ? <label className="ss-check"><input type="checkbox" checked={groupFileSync} onChange={(event) => setGroupFileSync(event.target.checked)} /><span><strong>Synchronize group-library files with Zotero Storage</strong><small>WebDAV applies only to personal libraries; group files always use Zotero Storage.</small></span></label> : null}
          {storageMode === "linked-folder" ? status.storageMode === "linked-folder" && status.linkedFolderAutomation
            ? <div className="ss-callout"><strong>Shared storage is active.</strong> ZotMoov moves server-added PDFs into <code>{status.linkedFolder ?? "/linked"}</code>. Desktop computers that add PDFs need ZotMoov pointed at the same shared folder.</div>
            : <div className="ss-callout ss-callout-warning"><strong>Attach External Storage first.</strong> Connect the same folder under ScholarServer Storage, install ZotMoov on each desktop that adds PDFs, and use matching relative paths. Linked files do not work in group libraries, Zotero Web Library, or Zotero mobile.</div> : null}
          <div><button className="ss-button" disabled={busy || !status.accountConnected || (storageMode === "webdav" && (!webdavUrl || !webdavUsername || !webdavPassword))} onClick={() => void saveStorage()}>{busy ? <span className="ss-spinner" /> : null}Save storage choice</button></div>
        </section>
        <section className="ss-card"><div className="ss-toolbar"><div><h2>3. Local authorization</h2><p className="ss-card-description">Open the private Zotero desktop from the ScholarServer dashboard. Zotero displays a one-time confirmation inside the desktop.</p></div>{status.localApi === "authorized" ? <span className="ss-badge ss-badge-success">Authorized</span> : <button className="ss-button" disabled={busy || !status.storageMode} onClick={() => void run(() => request<Status>("authorize", { method: "POST" }), "ScholarServer is authorized to use the Zotero local API.")}>{busy ? <span className="ss-spinner" /> : null}Authorize ScholarServer</button>}</div></section>
      </div> : null}
    </main>
  </div>;
}
