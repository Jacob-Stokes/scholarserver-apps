import { SetupPanel, SetupProgress } from "@scholarserver/ui/setup-pipeline";
import { useCallback, useEffect, useRef, useState } from "react";
import { AutomationsTab } from "./AutomationsTab";

type Status = {
  state: string;
  desktop: string;
  version: string | null;
  localApi: string;
  variant: string;
  connectionMode: "complete-workspace" | "online-library";
  storageMode: string | null;
  desktopAccess: DesktopAccessSelection | null;
  accountConnected: boolean;
  userId: string | null;
  username: string | null;
  downloadMode: string | null;
  groupFileSync: boolean;
  linkedFolder: string | null;
  linkedFolderAutomation: boolean;
  storageVerified: boolean;
  syncInProgress: boolean;
  lastError: string | null;
  permissions: { library: boolean; notes: boolean; write: boolean; groups: string } | null;
  features: { desktop: boolean; automations: boolean; localAttachments: boolean };
};
type DesktopAccessSelection = {
  optionId: string;
  transport: "tailscale" | "cloudflare" | "caddy" | "external-proxy";
  url: string;
};
type DesktopAccessOption = {
  id: string;
  transport: DesktopAccessSelection["transport"];
  label: string;
  url: string;
  recommended: boolean;
  advanced: boolean;
};
type Tab = "overview" | "attachments" | "automations" | "configuration";
type StorageMode = "zotero-storage" | "webdav" | "linked-folder" | "server-only" | "metadata-only";
type SetupStage = "account" | "storage" | "access" | "authorization" | "ready";

const tabs: Array<{ id: Tab; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "attachments", label: "Attachments" },
  { id: "automations", label: "Automations" },
  { id: "configuration", label: "Configuration" }
];
const setupStages: Array<{ id: SetupStage; label: string }> = [
  { id: "account", label: "Account" },
  { id: "storage", label: "Attachments" },
  { id: "access", label: "Desktop access" },
  { id: "authorization", label: "Authorization" },
  { id: "ready", label: "Ready" }
];
const storageOptions: Array<{ value: StorageMode; title: string; detail: string }> = [
  {
    value: "zotero-storage",
    title: "Zotero Storage",
    detail: "The simplest option. Zotero synchronizes references and attachments."
  },
  {
    value: "webdav",
    title: "WebDAV",
    detail: "Use a WebDAV account for personal-library attachments while Zotero syncs the references."
  },
  {
    value: "linked-folder",
    title: "Shared folder with ZotMoov",
    detail: "Keep linked PDFs in external storage shared with your other computers."
  },
  {
    value: "server-only",
    title: "References only",
    detail: "Synchronize the library database without downloading attachment files."
  }
];
const onlineStorageOptions: Array<{ value: StorageMode; title: string; detail: string }> = [
  {
    value: "metadata-only",
    title: "Citation data only",
    detail: "Use citations, collections, tags, and notes without downloading PDFs to this server."
  },
  {
    value: "zotero-storage",
    title: "Zotero Storage files on demand",
    detail: "Let ScholarServer fetch a PDF from Zotero Storage only when a tool or workflow needs it."
  }
];

function appBase(): string {
  const marker = "/apps/";
  const start = window.location.pathname.indexOf(marker);
  if (start < 0) return "";
  const instance = window.location.pathname.slice(start + marker.length).split("/")[0];
  return `${window.location.pathname.slice(0, start)}${marker}${instance}`;
}
const base = appBase();
const instanceId = decodeURIComponent(base.split("/").filter(Boolean).at(-1) ?? "");

function desktopUrl(endpointUrl: string): string {
  const target = new URL(endpointUrl, window.location.origin);
  const parameters = new URLSearchParams({
    autoconnect: "1",
    reconnect: "1",
    resize: "remote",
    path: `${target.pathname.replace(/\/$/, "")}/websockify`.replace(/^\/+/, "")
  });
  target.search = parameters.toString();
  return target.toString();
}

async function platformRequest<T>(url: string): Promise<T> {
  const response = await fetch(url);
  const result = (await response.json().catch(() => null)) as T | { detail?: string } | null;
  if (!response.ok) throw new Error((result as { detail?: string } | null)?.detail ?? "ScholarServer request failed");
  return result as T;
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${base}/api/${url}`, {
    ...init,
    headers: init?.body ? { "content-type": "application/json", ...init.headers } : init?.headers
  });
  const result = (await response.json().catch(() => null)) as T | { error?: string } | null;
  if (!response.ok) throw new Error((result as { error?: string } | null)?.error ?? "Zotero request failed");
  return result as T;
}

function currentTab(): Tab {
  const relative =
    base && window.location.pathname.startsWith(base)
      ? window.location.pathname.slice(base.length)
      : window.location.pathname;
  const value = relative.split("/").filter(Boolean)[0];
  return tabs.some((tab) => tab.id === value) ? (value as Tab) : "overview";
}
function storageName(value: string | null) {
  return (
    [...storageOptions, ...onlineStorageOptions].find((item) => item.value === value)?.title ??
    value ??
    "Not configured"
  );
}

export function App() {
  const [tab, setTab] = useState<Tab>(currentTab);
  const [status, setStatus] = useState<Status | null>(null);
  const [storageMode, setStorageMode] = useState<StorageMode>("zotero-storage");
  const [downloadMode, setDownloadMode] = useState("on-demand");
  const [groupFileSync, setGroupFileSync] = useState(true);
  const [webdavUrl, setWebdavUrl] = useState("");
  const [webdavUsername, setWebdavUsername] = useState("");
  const [webdavPassword, setWebdavPassword] = useState("");
  const [onlineApiKey, setOnlineApiKey] = useState("");
  const [authorizationUrl, setAuthorizationUrl] = useState<string | null>(null);
  const [desktopAccessOptions, setDesktopAccessOptions] = useState<DesktopAccessOption[]>([]);
  const [desktopAccessOption, setDesktopAccessOption] = useState("");
  const [desktopAccessLoading, setDesktopAccessLoading] = useState(false);
  const [checkingAccount, setCheckingAccount] = useState(false);
  const [attachmentKey, setAttachmentKey] = useState("");
  const [sourcePath, setSourcePath] = useState("");
  const [attachmentResult, setAttachmentResult] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [setupStage, setSetupStage] = useState<SetupStage>("account");
  const setupInitialized = useRef(false);
  const online = status?.connectionMode === "online-library";

  const refresh = useCallback(async () => {
    try {
      const next = await request<Status>("status");
      setStatus(next);
      if ([...storageOptions, ...onlineStorageOptions].some((item) => item.value === next.storageMode))
        setStorageMode(next.storageMode as StorageMode);
      else if (next.connectionMode === "online-library") setStorageMode("metadata-only");
      if (next.downloadMode === "on-sync" || next.downloadMode === "on-demand") setDownloadMode(next.downloadMode);
      setGroupFileSync(next.groupFileSync);
      if (next.desktopAccess?.optionId) setDesktopAccessOption(next.desktopAccess.optionId);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not inspect Zotero");
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 5000);
    return () => window.clearInterval(timer);
  }, [refresh]);
  useEffect(() => {
    if (!status || setupInitialized.current) return;
    setupInitialized.current = true;
    setSetupStage(
      status.state === "ready"
        ? "ready"
        : status.state === "authorization-required"
          ? "authorization"
          : status.state === "desktop-access-required"
            ? "access"
            : status.state === "storage-required"
              ? "storage"
              : "account"
    );
  }, [status]);
  useEffect(() => {
    if (online || !instanceId) return;
    let cancelled = false;
    setDesktopAccessLoading(true);
    void platformRequest<{ options: DesktopAccessOption[] }>(
      `/api/v1/instances/${encodeURIComponent(instanceId)}/endpoints/desktop/access-options`
    )
      .then(({ options }) => {
        if (cancelled) return;
        setDesktopAccessOptions(options);
        setDesktopAccessOption((current) =>
          options.some((option) => option.id === current)
            ? current
            : (options.find((option) => option.recommended)?.id ?? options[0]?.id ?? "")
        );
      })
      .catch((caught) => {
        if (!cancelled) setError(caught instanceof Error ? caught.message : "Could not inspect desktop access");
      })
      .finally(() => {
        if (!cancelled) setDesktopAccessLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [online]);
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
        setCheckingAccount(false);
        setAuthorizationUrl(null);
        setStatus(result);
        setNotice("Your Zotero account is connected.");
      } catch (caught) {
        if (!cancelled) {
          setCheckingAccount(false);
          setError(caught instanceof Error ? caught.message : "Could not finish Zotero account linking");
        }
      }
    };
    const timer = window.setTimeout(check, 1500);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [checkingAccount]);

  const navigate = (next: Tab) => {
    window.history.pushState({}, "", `${base}/${next}`);
    setTab(next);
  };
  const run = async <T,>(operation: () => Promise<T>, success: string, result?: (value: T) => void) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const value = await operation();
      result?.(value);
      setNotice(success);
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The operation failed");
    } finally {
      setBusy(false);
    }
  };
  const connectAccount = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    const popup = window.open("about:blank", "_blank");
    if (popup) {
      popup.document.title = "Opening Zotero sign-in…";
      popup.document.body.style.cssText = "font: 16px system-ui; margin: 3rem; color: #1f2937";
      popup.document.body.textContent = "Preparing your secure Zotero sign-in…";
    }
    try {
      const result = await request<{ loginUrl: string }>("account/start", { method: "POST" });
      if (!result.loginUrl || new URL(result.loginUrl).protocol !== "https:")
        throw new Error("Zotero returned an invalid sign-in address");
      setAuthorizationUrl(result.loginUrl);
      if (popup) popup.location.replace(result.loginUrl);
      setCheckingAccount(true);
    } catch (caught) {
      popup?.close();
      setError(caught instanceof Error ? caught.message : "Could not start Zotero account linking");
    } finally {
      setBusy(false);
    }
  };
  const saveStorage = () =>
    run(
      () =>
        storageMode === "webdav"
          ? request<Status>("storage/webdav", {
              method: "POST",
              body: JSON.stringify({
                url: webdavUrl,
                username: webdavUsername,
                password: webdavPassword,
                downloadMode,
                groupFileSync
              })
            })
          : request<Status>("storage", {
              method: "POST",
              body: JSON.stringify({ storageMode, downloadMode, groupFileSync })
            }),
      "Attachment access settings were saved.",
      () => {
        setWebdavPassword("");
        setSetupStage(status?.connectionMode === "online-library" ? "ready" : "access");
      }
    );
  const saveDesktopAccess = () => {
    const selected = desktopAccessOptions.find((option) => option.id === desktopAccessOption);
    if (!selected) return;
    void run(
      () =>
        request<Status>("desktop-access", {
          method: "POST",
          body: JSON.stringify({ optionId: selected.id, transport: selected.transport, url: selected.url })
        }),
      "Zotero Desktop access is ready.",
      () => setSetupStage("authorization")
    );
  };
  const connectOnlineLibrary = () =>
    run(
      () => request<Status>("account/online", { method: "POST", body: JSON.stringify({ apiKey: onlineApiKey }) }),
      "Your Zotero online library is connected.",
      () => {
        setOnlineApiKey("");
        setSetupStage("storage");
      }
    );
  const openDesktopAndAuthorize = () => {
    if (!status?.desktopAccess?.url) return;
    window.open(desktopUrl(status.desktopAccess.url), "_blank", "noopener,noreferrer");
    void run(
      () => request<Status>("authorize", { method: "POST" }),
      "ScholarServer is authorized to use the Zotero local API.",
      () => setSetupStage("ready")
    );
  };
  const ready = status?.state === "ready";
  const selectedDesktopAccess = desktopAccessOptions.find((option) => option.id === desktopAccessOption) ?? null;
  const visibleTabs = status?.features.automations ? tabs : tabs.filter((item) => item.id !== "automations");
  const activeSetupStages = online
    ? setupStages.filter((stage) => stage.id !== "access" && stage.id !== "authorization")
    : setupStages;

  return (
    <div className="ss-app">
      <header className="ss-app-header">
        <div className="ss-app-header-inner">
          <div className="ss-brand">
            <div className="ss-brand-mark">S</div>
            <div>
              <p className="ss-brand-title">ScholarServer</p>
              <p className="ss-brand-context">Zotero</p>
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
            <h1>Zotero</h1>
            <p>
              {online
                ? "Use your zotero.org library with ScholarServer and approved AI tools."
                : "Manage your private Zotero workspace, attachments, automations, and remote Zotero MCP."}
            </p>
          </div>
          {status ? (
            <span className={`ss-badge ${ready ? "ss-badge-success" : "ss-badge-warning"}`}>
              {ready ? "Ready" : "Setup needed"}
            </span>
          ) : null}
        </div>
        <nav className="ss-tabs" aria-label="Zotero sections">
          {visibleTabs.map((item) => (
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
            <span className="ss-spinner" /> Loading Zotero…
          </div>
        ) : null}

        {status && tab === "overview" ? (
          <div className="ss-stack">
            <div className="ss-grid ss-grid-3">
              <div className="ss-card">
                <div className="ss-metric-label">Connection</div>
                <div className="ss-metric-value">{online ? "Online library" : "Complete workspace"}</div>
              </div>
              <div className="ss-card">
                <div className="ss-metric-label">Account</div>
                <div className="ss-metric-value">{status.username ?? status.userId ?? "Not connected"}</div>
              </div>
              <div className="ss-card">
                <div className="ss-metric-label">Attachment access</div>
                <div className="ss-metric-value">{storageName(status.storageMode)}</div>
              </div>
            </div>
            <section className="ss-card">
              <div className="ss-toolbar">
                <div>
                  <h2>Library connection</h2>
                  <p className="ss-card-description">
                    {online
                      ? "ScholarServer talks securely to your zotero.org library. Zotero Desktop is not installed on this server."
                      : "Zotero runs privately on this server; ScholarServer talks to its supported local API."}
                  </p>
                </div>
                <button className="ss-button ss-button-secondary" onClick={() => void refresh()}>
                  Refresh
                </button>
              </div>
              <dl className="ss-details">
                <dt>Setup state</dt>
                <dd>{status.state}</dd>
                <dt>Connection</dt>
                <dd>{online ? "Zotero Web API" : `Zotero Desktop ${status.version ?? ""}`}</dd>
                {online ? (
                  <>
                    <dt>Make changes</dt>
                    <dd>{status.permissions?.write ? "Allowed" : "Read only"}</dd>
                    <dt>Group libraries</dt>
                    <dd>{status.permissions?.groups ?? "None"}</dd>
                  </>
                ) : (
                  <>
                    <dt>Local API</dt>
                    <dd>{status.localApi}</dd>
                    <dt>File downloads</dt>
                    <dd>{status.downloadMode ?? "Not configured"}</dd>
                  </>
                )}
                {status.storageMode === "linked-folder" ? (
                  <>
                    <dt>Shared folder</dt>
                    <dd>{status.linkedFolder ?? "/linked"}</dd>
                    <dt>ZotMoov automation</dt>
                    <dd>{status.linkedFolderAutomation ? "Enabled" : "Needs attention"}</dd>
                  </>
                ) : null}
              </dl>
            </section>
            <section className="ss-card">
              <div className="ss-toolbar">
                <div>
                  <h2>{ready ? (online ? "Online access" : "Synchronization") : "Setup is incomplete"}</h2>
                  <p className="ss-card-description">
                    {ready
                      ? online
                        ? "Your tools read the latest library data directly from zotero.org; there is nothing to synchronize here."
                        : "Start an immediate library sync when you need one."
                      : online
                        ? "Complete the guided account and attachment-access steps."
                        : "Complete the guided account, storage, and authorization steps."}
                  </p>
                </div>
                {ready && !online ? (
                  <button
                    className="ss-button"
                    disabled={busy || status.syncInProgress}
                    onClick={() =>
                      void run(() => request<Status>("sync", { method: "POST" }), "Zotero synchronization completed.")
                    }
                  >
                    {busy || status.syncInProgress ? <span className="ss-spinner" /> : null}Sync now
                  </button>
                ) : !ready ? (
                  <button className="ss-button" onClick={() => navigate("configuration")}>
                    Continue setup
                  </button>
                ) : null}
              </div>
            </section>
          </div>
        ) : null}

        {status && tab === "attachments" ? (
          <div className="ss-grid ss-grid-3">
            <section className="ss-card ss-stack">
              <div>
                <h2>Resolve an attachment</h2>
                <p className="ss-card-description">
                  Confirm that a Zotero attachment key resolves to a safe local file.
                </p>
              </div>
              <label className="ss-field">
                Attachment key
                <input
                  className="ss-input"
                  maxLength={8}
                  placeholder="ABCD1234"
                  value={attachmentKey}
                  onChange={(event) => setAttachmentKey(event.target.value.toUpperCase())}
                />
              </label>
              <button
                className="ss-button"
                disabled={busy || !/^[A-Z0-9]{8}$/.test(attachmentKey)}
                onClick={() =>
                  void run(
                    () =>
                      request<unknown>("attachments/resolve", {
                        method: "POST",
                        body: JSON.stringify({ attachmentKey })
                      }),
                    "Attachment resolved.",
                    setAttachmentResult
                  )
                }
              >
                Resolve
              </button>
            </section>
            {!online ? (
              <section className="ss-card ss-stack">
                <div>
                  <h2>Match a shared file</h2>
                  <p className="ss-card-description">
                    Find the Zotero attachment corresponding to a path inside the linked research folder.
                  </p>
                </div>
                <label className="ss-field">
                  Relative file path
                  <input
                    className="ss-input"
                    placeholder="Papers/example.pdf"
                    value={sourcePath}
                    onChange={(event) => setSourcePath(event.target.value)}
                  />
                </label>
                <button
                  className="ss-button"
                  disabled={busy || !sourcePath.trim()}
                  onClick={() =>
                    void run(
                      () =>
                        request<unknown>("attachments/match", { method: "POST", body: JSON.stringify({ sourcePath }) }),
                      "Attachment matching completed.",
                      setAttachmentResult
                    )
                  }
                >
                  Find match
                </button>
              </section>
            ) : (
              <section className="ss-card">
                <h2>How online files work</h2>
                <p className="ss-card-description">
                  Zotero Storage files can be fetched when needed. WebDAV and linked-file contents require the Complete
                  Zotero workspace.
                </p>
              </section>
            )}
            <section className="ss-card">
              <h2>Result</h2>
              <p className="ss-card-description">Diagnostic metadata is shown without exposing the server file path.</p>
              {attachmentResult ? (
                <pre className="ss-result ss-code">{JSON.stringify(attachmentResult, null, 2)}</pre>
              ) : (
                <p className="ss-muted">No attachment checked yet.</p>
              )}
            </section>
          </div>
        ) : null}

        {status?.features.automations && tab === "automations" ? (
          <AutomationsTab base={base} request={request} setNotice={setNotice} setError={setError} />
        ) : null}

        {status && tab === "configuration" ? (
          <div className="ss-stack">
            <SetupProgress stages={activeSetupStages} current={setupStage} />
            {setupStage === "account" ? (
              <SetupPanel
                stage={1}
                total={online ? 3 : 5}
                title="Connect your Zotero account"
                description={
                  online
                    ? "Create a dedicated key in Zotero, then paste it here. ScholarServer stores it privately on this server."
                    : "Sign in on Zotero's website. ScholarServer never receives your Zotero password."
                }
                next={status.accountConnected ? () => setSetupStage("storage") : undefined}
                nextLabel="Choose attachment access"
              >
                {status.accountConnected ? (
                  <div className="ss-callout">
                    Connected as <strong>{status.username ?? status.userId}</strong>.{" "}
                    {online
                      ? "ScholarServer uses a dedicated Zotero key that you can revoke at any time."
                      : "Zotero stores its own account token."}
                  </div>
                ) : online ? (
                  <div className="ss-stack">
                    <div className="ss-callout">
                      <strong>Create a ScholarServer key in Zotero.</strong> Allow library and notes access. Enable
                      write access if you want AI tools to create or edit citations and notes.
                    </div>
                    <div className="ss-form-actions">
                      <a
                        className="ss-button ss-button-secondary"
                        href="https://www.zotero.org/settings/keys/new?name=ScholarServer&library_access=1&notes_access=1&write_access=1&all_groups=write"
                        target="_blank"
                        rel="noreferrer"
                      >
                        Create key on Zotero
                      </a>
                    </div>
                    <label className="ss-field">
                      Zotero API key
                      <input
                        className="ss-input"
                        type="password"
                        autoComplete="off"
                        value={onlineApiKey}
                        onChange={(event) => setOnlineApiKey(event.target.value)}
                      />
                      <span className="ss-field-help">
                        Copy the key Zotero shows after you save it. It is sent only to this ScholarServer.
                      </span>
                    </label>
                    <div className="ss-form-actions">
                      <button
                        className="ss-button"
                        disabled={busy || onlineApiKey.trim().length < 16}
                        onClick={() => void connectOnlineLibrary()}
                      >
                        {busy ? <span className="ss-spinner" /> : null}Connect online library
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="ss-form-actions">
                    <button
                      className="ss-button"
                      disabled={busy || checkingAccount}
                      onClick={() => void connectAccount()}
                    >
                      {busy || checkingAccount ? <span className="ss-spinner" /> : null}
                      {checkingAccount ? "Waiting for approval…" : "Connect Zotero account"}
                    </button>
                    {authorizationUrl ? (
                      <a
                        className="ss-button ss-button-secondary"
                        href={authorizationUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open Zotero sign-in
                      </a>
                    ) : null}
                  </div>
                )}
              </SetupPanel>
            ) : null}

            {setupStage === "storage" ? (
              <SetupPanel
                stage={2}
                total={online ? 3 : 5}
                title={online ? "Choose attachment access" : "Choose where attachments live"}
                description={
                  online
                    ? "Choose whether this server should access only citation data or fetch files from Zotero Storage when needed."
                    : "Your references always synchronize through Zotero. Choose separately how this server obtains PDFs and other files."
                }
                back={() => setSetupStage("account")}
                next={() => void saveStorage()}
                nextLabel="Save and continue"
                nextDisabled={
                  !status.accountConnected ||
                  (storageMode === "webdav" && (!webdavUrl || !webdavUsername || !webdavPassword))
                }
                busy={busy}
              >
                <label className="ss-field">
                  {online ? "Attachment access" : "Storage option"}
                  <select
                    className="ss-input"
                    value={storageMode}
                    onChange={(event) => {
                      const next = event.target.value as StorageMode;
                      setStorageMode(next);
                      setGroupFileSync(next === "zotero-storage");
                    }}
                  >
                    {(online ? onlineStorageOptions : storageOptions).map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.title}
                      </option>
                    ))}
                  </select>
                  <span className="ss-field-help ss-storage-description">
                    {
                      (online ? onlineStorageOptions : storageOptions).find((option) => option.value === storageMode)
                        ?.detail
                    }
                  </span>
                </label>
                {storageMode === "webdav" ? (
                  <>
                    <label className="ss-field">
                      WebDAV URL
                      <input
                        className="ss-input"
                        type="url"
                        placeholder="https://dav.example.org/zotero"
                        value={webdavUrl}
                        onChange={(event) => setWebdavUrl(event.target.value)}
                      />
                    </label>
                    <label className="ss-field">
                      WebDAV username
                      <input
                        className="ss-input"
                        autoComplete="username"
                        value={webdavUsername}
                        onChange={(event) => setWebdavUsername(event.target.value)}
                      />
                    </label>
                    <label className="ss-field">
                      WebDAV password{" "}
                      <span className="ss-field-help">
                        Sent directly to Zotero's credential store and discarded after configuration.
                      </span>
                      <input
                        className="ss-input"
                        type="password"
                        autoComplete="current-password"
                        value={webdavPassword}
                        onChange={(event) => setWebdavPassword(event.target.value)}
                      />
                    </label>
                  </>
                ) : null}
                {!online && storageMode !== "server-only" && storageMode !== "linked-folder" ? (
                  <label className="ss-field">
                    Download attachments
                    <select
                      className="ss-input"
                      value={downloadMode}
                      onChange={(event) => setDownloadMode(event.target.value)}
                    >
                      <option value="on-demand">When opened — saves server disk space</option>
                      <option value="on-sync">During every sync — keeps a complete local copy</option>
                    </select>
                  </label>
                ) : null}
                {!online && (storageMode === "zotero-storage" || storageMode === "webdav") ? (
                  <label className="ss-check">
                    <input
                      type="checkbox"
                      checked={groupFileSync}
                      onChange={(event) => setGroupFileSync(event.target.checked)}
                    />
                    <span>
                      <strong>Synchronize group-library files with Zotero Storage</strong>
                      <small>WebDAV applies only to personal libraries; group files always use Zotero Storage.</small>
                    </span>
                  </label>
                ) : null}
                {storageMode === "linked-folder" ? (
                  status.storageMode === "linked-folder" && status.linkedFolderAutomation ? (
                    <div className="ss-callout">
                      <strong>Shared storage is active.</strong> ZotMoov moves server-added PDFs into{" "}
                      <code>{status.linkedFolder ?? "/linked"}</code>. Desktop computers that add PDFs need ZotMoov
                      pointed at the same shared folder.
                    </div>
                  ) : (
                    <div className="ss-callout ss-callout-warning">
                      <strong>Attach External Storage first.</strong> Connect the same folder under ScholarServer
                      Storage, install ZotMoov on each desktop that adds PDFs, and use matching relative paths. Linked
                      files do not work in group libraries, Zotero Web Library, or Zotero mobile.
                    </div>
                  )
                ) : null}
              </SetupPanel>
            ) : null}

            {setupStage === "access" && !online ? (
              <SetupPanel
                stage={3}
                total={5}
                title="Choose how to open Zotero Desktop"
                description="ScholarServer keeps Zotero behind a protected server address. Only connections already prepared in Access are shown here."
                back={() => setSetupStage("storage")}
                next={saveDesktopAccess}
                nextLabel="Use this address"
                nextDisabled={!selectedDesktopAccess}
                busy={busy || desktopAccessLoading}
              >
                {desktopAccessLoading ? (
                  <div className="ss-loading">
                    <span className="ss-spinner" /> Checking your available connections…
                  </div>
                ) : desktopAccessOptions.length > 0 ? (
                  <div className="ss-stack">
                    {desktopAccessOptions.map((option) => (
                      <label className="ss-choice" key={option.id}>
                        <input
                          type="radio"
                          name="desktop-access"
                          checked={desktopAccessOption === option.id}
                          onChange={() => setDesktopAccessOption(option.id)}
                        />
                        <span>
                          <strong>
                            {option.label} {option.recommended ? <em>Recommended</em> : null}{" "}
                            {option.advanced ? <em>Advanced</em> : null}
                          </strong>
                          <small>
                            {option.transport === "tailscale"
                              ? "Private to devices signed in to your Tailscale network."
                              : option.transport === "cloudflare"
                                ? "Available through the Cloudflare connection configured for ScholarServer."
                                : "Uses the HTTPS connection you configured and maintain in ScholarServer Access."}
                          </small>
                          <code>{option.url}</code>
                        </span>
                      </label>
                    ))}
                    <p className="ss-muted">
                      Need another connection? Return to ScholarServer, open <strong>Access</strong>, prepare it there,
                      then come back to this step.
                    </p>
                  </div>
                ) : (
                  <div className="ss-callout ss-callout-warning ss-stack">
                    <strong>No protected desktop connection is ready yet.</strong>
                    <span>
                      Return to ScholarServer and finish Tailscale or an authenticated public HTTPS connection in
                      Access. Zotero itself remains private while you do this.
                    </span>
                    <div className="ss-form-actions">
                      <a className="ss-button ss-button-secondary" href="/">
                        Back to ScholarServer
                      </a>
                    </div>
                  </div>
                )}
              </SetupPanel>
            ) : null}

            {setupStage === "authorization" ? (
              <SetupPanel
                stage={4}
                total={5}
                title="Authorize ScholarServer"
                description="Zotero asks once before ScholarServer can use its supported local API."
                back={() => setSetupStage("access")}
                next={status.localApi === "authorized" ? () => setSetupStage("ready") : openDesktopAndAuthorize}
                nextLabel={status.localApi === "authorized" ? "Finish setup" : "Open Zotero and authorize"}
                nextDisabled={!status.storageMode || !status.desktopAccess}
                busy={busy}
              >
                <div className="ss-callout ss-stack">
                  <div>
                    <strong>One confirmation remains.</strong> ScholarServer opens the private Zotero desktop in a new
                    tab. Approve the request shown inside Zotero.
                  </div>
                  <div className="ss-form-actions">
                    {status.desktopAccess?.url ? (
                      <a
                        className="ss-button ss-button-secondary"
                        href={desktopUrl(status.desktopAccess.url)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open Zotero desktop
                      </a>
                    ) : null}
                  </div>
                </div>
                {status.localApi === "authorized" ? (
                  <div className="ss-alert ss-alert-success">ScholarServer is authorized.</div>
                ) : null}
              </SetupPanel>
            ) : null}

            {setupStage === "ready" ? (
              <SetupPanel
                stage={online ? 3 : 5}
                total={online ? 3 : 5}
                title="Zotero is connected"
                description={
                  online
                    ? "Your online library and attachment-access choice are ready."
                    : "Your library, attachment choice, and ScholarServer authorization are ready."
                }
                back={() => setSetupStage(online ? "storage" : "authorization")}
              >
                <div className="ss-alert ss-alert-success">
                  Setup is complete.{" "}
                  {online
                    ? "Approved AI tools can now work with your online Zotero library."
                    : "You can synchronize Zotero and use approved AI tools from this server."}
                </div>
                <dl className="ss-details">
                  <dt>Account</dt>
                  <dd>{status.username ?? status.userId ?? "Connected"}</dd>
                  <dt>Attachment access</dt>
                  <dd>{storageName(status.storageMode)}</dd>
                  {online ? (
                    <>
                      <dt>Connection</dt>
                      <dd>Zotero Web API</dd>
                      <dt>Make changes</dt>
                      <dd>{status.permissions?.write ? "Allowed" : "Read only"}</dd>
                    </>
                  ) : (
                    <>
                      <dt>Desktop address</dt>
                      <dd>{status.desktopAccess?.url ?? "Not configured"}</dd>
                      <dt>Local API</dt>
                      <dd>{status.localApi}</dd>
                    </>
                  )}
                </dl>
              </SetupPanel>
            ) : null}
          </div>
        ) : null}
      </main>
    </div>
  );
}
