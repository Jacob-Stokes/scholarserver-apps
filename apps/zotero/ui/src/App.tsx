import { ApplicationScreen } from "@scholarserver/ui/application-screen";
import { type EndpointAccessOption, EndpointAccessSelector } from "@scholarserver/ui/endpoint-access";
import { SetupPanel, SetupProgress } from "@scholarserver/ui/setup-pipeline";
import { useCallback, useEffect, useRef, useState } from "react";
import { AccountStep } from "./AccountStep";
import { AuthorizationStep } from "./AuthorizationStep";
import { AutomationsTab } from "./AutomationsTab";
import { StorageStep } from "./StorageStep";
import {
  type AccountSession,
  approvedLoginUrl,
  canEmbedDesktop,
  type DesktopAccessResponse,
  type DesktopAccessSelection,
  defaultDesktopAuthentication,
  initialSetupStage,
  onlineStorageOptions,
  type SetupStage,
  type Status,
  type StorageMode,
  type StorageSettings,
  selectedDesktopOptionId,
  stageAfterAccessLoad,
  storageOptions
} from "./setup-model";

type Tab = "overview" | "attachments" | "automations" | "configuration";

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

async function platformRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: init?.body ? { "content-type": "application/json", ...init.headers } : init?.headers
  });
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
  const [storageSettings, setStorageSettings] = useState<StorageSettings>({
    storageMode: "zotero-storage",
    downloadMode: "on-demand",
    groupFileSync: true,
    webdavUrl: "",
    webdavUsername: "",
    webdavPassword: ""
  });
  const { storageMode, downloadMode, groupFileSync, webdavUrl, webdavUsername, webdavPassword } = storageSettings;
  const [onlineApiKey, setOnlineApiKey] = useState("");
  const [authorizationUrl, setAuthorizationUrl] = useState<string | null>(null);
  const [desktopAccessOptions, setDesktopAccessOptions] = useState<EndpointAccessOption[]>([]);
  const [desktopAccessOption, setDesktopAccessOption] = useState("");
  const [desktopAuthentication, setDesktopAuthentication] = useState<"none" | "authentik">("none");
  const [desktopAccessSelection, setDesktopAccessSelection] = useState<DesktopAccessSelection | null>(null);
  const [desktopAccessLoading, setDesktopAccessLoading] = useState(false);
  const [checkingAccount, setCheckingAccount] = useState(false);
  const [accountSession, setAccountSession] = useState<AccountSession>({ state: "idle" });
  const [showSetupDesktop, setShowSetupDesktop] = useState(false);
  const accountWindow = useRef<Window | null>(null);
  const accountWasPending = useRef(false);
  const [attachmentKey, setAttachmentKey] = useState("");
  const [sourcePath, setSourcePath] = useState("");
  const [attachmentResult, setAttachmentResult] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [setupStage, setSetupStage] = useState<SetupStage>("account");
  const setupInitialized = useRef(false);
  const settingsInitialized = useRef(false);
  const statusRequest = useRef<AbortController | null>(null);
  const connectionMode = status?.connectionMode;
  const online = connectionMode === "online-library";

  const refresh = useCallback(async (poll = false) => {
    if (poll && statusRequest.current) return;
    statusRequest.current?.abort();
    const controller = new AbortController();
    statusRequest.current = controller;
    try {
      const next = await request<Status>("status", { signal: controller.signal });
      if (controller.signal.aborted) return;
      setStatus(next);
      // Polling updates health, not the choices the researcher is editing.
      if (!settingsInitialized.current) {
        setStorageSettings((current) => {
          let savedStorageMode = current.storageMode;
          if ([...storageOptions, ...onlineStorageOptions].some((item) => item.value === next.storageMode)) {
            savedStorageMode = next.storageMode as StorageMode;
          } else if (next.connectionMode === "online-library") {
            savedStorageMode = "metadata-only";
          }
          let savedDownloadMode = current.downloadMode;
          if (next.downloadMode === "on-sync" || next.downloadMode === "on-demand") {
            savedDownloadMode = next.downloadMode;
          }
          return {
            ...current,
            storageMode: savedStorageMode,
            downloadMode: savedDownloadMode,
            groupFileSync: next.groupFileSync
          };
        });
        settingsInitialized.current = true;
      }
      setStatusError(null);
    } catch (caught) {
      if (controller.signal.aborted) return;
      setStatusError(caught instanceof Error ? caught.message : "Could not inspect Zotero");
    } finally {
      if (statusRequest.current === controller) statusRequest.current = null;
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(true), 5000);
    return () => {
      window.clearInterval(timer);
      statusRequest.current?.abort();
      statusRequest.current = null;
    };
  }, [refresh]);
  useEffect(() => {
    if (!status || setupInitialized.current) return;
    setupInitialized.current = true;
    setSetupStage(initialSetupStage(status.state));
  }, [status]);
  useEffect(() => {
    if (connectionMode !== "complete-workspace" || !instanceId) return;
    let cancelled = false;
    setDesktopAccessLoading(true);
    void platformRequest<DesktopAccessResponse>(
      `/api/v1/instances/${encodeURIComponent(instanceId)}/endpoints/desktop/access-options`
    )
      .then(({ options, selection }) => {
        if (cancelled) return;
        setDesktopAccessOptions(options);
        setDesktopAccessSelection(selection);
        const preferred =
          options.find((option) => option.id === selection?.optionId) ??
          options.find((option) => option.recommended) ??
          options[0];
        if (selection) setDesktopAuthentication(selection.authentication);
        else if (preferred) setDesktopAuthentication(defaultDesktopAuthentication(preferred));
        setDesktopAccessOption((current) => selectedDesktopOptionId(options, selection?.optionId, current));
        setSetupStage((current) => stageAfterAccessLoad(current, Boolean(selection)));
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
  }, [connectionMode]);
  useEffect(() => {
    const pop = () => setTab(currentTab());
    window.addEventListener("popstate", pop);
    return () => window.removeEventListener("popstate", pop);
  }, []);
  useEffect(() => {
    if (connectionMode !== "complete-workspace") return;
    let cancelled = false;
    let timer: number;
    const check = async () => {
      if (cancelled) return;
      try {
        const result = await request<AccountSession>("account/session");
        if (cancelled) return;
        setAccountSession(result);
        setCheckingAccount(result.state === "pending" || result.state === "starting");
        setAuthorizationUrl(result.loginUrl ? approvedLoginUrl(result.loginUrl) : null);
        if (result.state === "pending" || result.state === "starting") accountWasPending.current = true;
        if (result.state === "connected" && accountWasPending.current) {
          accountWasPending.current = false;
          accountWindow.current?.close();
          accountWindow.current = null;
          await refresh();
          setSetupStage((current) => (current === "account" ? "storage" : current));
          setNotice("Your Zotero account is connected.");
        }
        if (result.state === "cancelled") accountWasPending.current = false;
      } catch (caught) {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : "Could not finish Zotero account linking");
        }
      } finally {
        if (!cancelled) timer = window.setTimeout(check, 2500);
      }
    };
    timer = window.setTimeout(check, 1500);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [connectionMode, refresh]);

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
    accountWindow.current = popup;
    if (popup) {
      popup.document.title = "Opening Zotero sign-in…";
      popup.document.body.style.cssText = "font: 16px system-ui; margin: 3rem; color: #1f2937";
      popup.document.body.textContent = "Preparing your secure Zotero sign-in…";
    }
    try {
      const result = await request<AccountSession>("account/start", { method: "POST" });
      setAccountSession(result);
      if (result.state !== "pending" || !result.loginUrl) {
        popup?.close();
        throw new Error(result.error ?? "Open Zotero to inspect the existing account connection.");
      }
      const loginUrl = approvedLoginUrl(result.loginUrl);
      setAuthorizationUrl(loginUrl);
      if (popup) {
        popup.opener = null;
        popup.location.replace(loginUrl);
      }
      accountWasPending.current = true;
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
        setStorageSettings((current) => ({ ...current, webdavPassword: "" }));
        if (status?.connectionMode === "online-library") setSetupStage("ready");
        else if (desktopAccessSelection) setSetupStage("authorization");
        else setSetupStage("access");
      }
    );
  const saveDesktopAccess = () => {
    const selected = desktopAccessOptions.find((option) => option.id === desktopAccessOption);
    if (!selected) return;
    void run(
      async () => {
        const response = await platformRequest<DesktopAccessResponse>(
          `/api/v1/instances/${encodeURIComponent(instanceId)}/endpoints/desktop/access-options`,
          {
            method: "PUT",
            body: JSON.stringify({ optionId: selected.id, authentication: desktopAuthentication })
          }
        );
        setDesktopAccessSelection(response.selection);
        return refresh();
      },
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
    if (!desktopAccessSelection?.url) return;
    if (canEmbedDesktop(desktopAccessSelection.url, window.location.origin)) setShowSetupDesktop(true);
    else window.open(desktopUrl(desktopAccessSelection.url), "_blank", "noopener,noreferrer");
    void run(
      () => request<Status>("authorize", { method: "POST" }),
      "ScholarServer is authorized to use the Zotero local API.",
      () => {
        setShowSetupDesktop(false);
        setSetupStage("ready");
      }
    );
  };
  const ready = status?.state === "ready";
  const selectedDesktopAccess = desktopAccessOptions.find((option) => option.id === desktopAccessOption) ?? null;
  const visibleTabs = status?.features.automations ? tabs : tabs.filter((item) => item.id !== "automations");
  const activeSetupStages = online
    ? setupStages.filter((stage) => stage.id !== "access" && stage.id !== "authorization")
    : setupStages;

  return (
    <ApplicationScreen
      name="Zotero"
      description={
        online
          ? "Use your zotero.org library with ScholarServer and approved AI tools."
          : "Manage your Zotero library, attachments, automations and access from AI tools."
      }
      status={
        status ? (
          <span className={`ss-badge ${ready ? "ss-badge-success" : "ss-badge-warning"}`}>
            {ready ? "Ready" : "Setup needed"}
          </span>
        ) : null
      }
      tabs={visibleTabs}
      currentTab={tab}
      onNavigate={navigate}
      notice={notice}
      error={error || statusError || status?.lastError}
      loading={!status}
    >
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
                    void run(
                      () => request<Status>("sync", { method: "POST" }),
                      "Zotero finished the sync request. Check another device to confirm delivery."
                    )
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
              <h2>Check attachment access</h2>
              <p className="ss-card-description">
                Check whether ScholarServer can read a Zotero attachment on this server.
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
            <AccountStep
              online={online}
              status={status}
              busy={busy}
              checkingAccount={checkingAccount}
              session={accountSession}
              recoveryUrl={desktopAccessSelection?.url ? desktopUrl(desktopAccessSelection.url) : null}
              onPrepareRecovery={() => setSetupStage("access")}
              authorizationUrl={authorizationUrl}
              onlineApiKey={onlineApiKey}
              onApiKeyChange={setOnlineApiKey}
              onConnectOnline={() => void connectOnlineLibrary()}
              onConnectAccount={() => void connectAccount()}
              onContinue={() => setSetupStage("storage")}
            />
          ) : null}

          {setupStage === "storage" ? (
            <StorageStep
              online={online}
              status={status}
              busy={busy}
              settings={storageSettings}
              onChange={setStorageSettings}
              onBack={() => setSetupStage("account")}
              onSave={() => void saveStorage()}
            />
          ) : null}

          {setupStage === "access" && !online ? (
            <SetupPanel
              stage={3}
              total={5}
              title="Choose how to open Zotero Desktop"
              description="Choose how to open the Zotero desktop. Only connections configured in Access are available here."
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
                  <EndpointAccessSelector
                    options={desktopAccessOptions}
                    optionId={desktopAccessOption}
                    authentication={desktopAuthentication}
                    onOptionChange={(option) => {
                      setDesktopAccessOption(option.id);
                      setDesktopAuthentication(defaultDesktopAuthentication(option));
                    }}
                    onAuthenticationChange={setDesktopAuthentication}
                  />
                  <p className="ss-muted">
                    Need another connection? Return to ScholarServer, open <strong>Access</strong>, prepare it there,
                    then come back to this step.
                  </p>
                </div>
              ) : (
                <div className="ss-callout ss-callout-warning ss-stack">
                  <strong>No protected desktop connection is ready yet.</strong>
                  <span>
                    Return to ScholarServer and finish Tailscale or an authenticated public HTTPS connection in Access.
                    Zotero itself remains private while you do this.
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
            <AuthorizationStep
              authorized={status.localApi === "authorized"}
              busy={busy}
              desktopUrl={desktopAccessSelection?.url ? desktopUrl(desktopAccessSelection.url) : null}
              embedded={Boolean(
                desktopAccessSelection?.url && canEmbedDesktop(desktopAccessSelection.url, window.location.origin)
              )}
              showDesktop={showSetupDesktop}
              onShowDesktop={setShowSetupDesktop}
              onAuthorize={openDesktopAndAuthorize}
              onBack={() => setSetupStage("access")}
              onContinue={() => setSetupStage("ready")}
            />
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
                Connection settings are saved.{" "}
                {online
                  ? "Check the Zotero connection under ScholarServer’s AI connections before using it from an AI tool."
                  : "Run an initial sync, then check attachment access and ScholarServer’s AI connection separately."}
              </div>
              {!online ? (
                <button
                  className="ss-button"
                  disabled={busy || status.syncInProgress}
                  onClick={() =>
                    void run(
                      () => request<Status>("sync", { method: "POST" }),
                      "Zotero finished the sync request. Check another device to confirm delivery."
                    )
                  }
                >
                  {busy || status.syncInProgress ? "Syncing…" : "Run initial sync"}
                </button>
              ) : null}
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
                    <dd>{desktopAccessSelection?.url ?? "Not configured"}</dd>
                    <dt>Local API</dt>
                    <dd>{status.localApi}</dd>
                  </>
                )}
              </dl>
            </SetupPanel>
          ) : null}
        </div>
      ) : null}
    </ApplicationScreen>
  );
}
