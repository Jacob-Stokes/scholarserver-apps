import { ApplicationScreen } from "@scholarserver/ui/application-screen";
import { SectionFeedback } from "@scholarserver/ui/section-feedback";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type JobState = "queued" | "running" | "succeeded" | "failed";
type Job = {
  id: string;
  sourcePath: string;
  sourceBytes: number;
  sourceAttachmentKey: string | null;
  profile: string;
  state: JobState;
  attempts: number;
  outputPath: string | null;
  error: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  updatedAt: string;
};
type Status = {
  state: "ready" | "paused";
  engine: "available" | "unavailable";
  workerConcurrency: number;
  counts: Record<JobState, number>;
  jobs: Job[];
  outputFolder: string;
  updatedAt: string;
};
type FileEntry = { path: string; bytes: number };
type Settings = { defaultOcr: boolean };
type Tab = "queue" | "process" | "configuration";

const tabs: Array<{ id: Tab; label: string }> = [
  { id: "queue", label: "Queue" },
  { id: "process", label: "Process PDF" },
  { id: "configuration", label: "Configuration" }
];

function appBase(): string {
  const marker = "/apps/";
  const start = window.location.pathname.indexOf(marker);
  if (start < 0) return "";
  const remainder = window.location.pathname.slice(start + marker.length);
  const instance = remainder.split("/")[0];
  return `${window.location.pathname.slice(0, start)}${marker}${instance}`;
}

const base = appBase();

class SignInRequired extends Error {}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${base}/api/${path}`, {
    ...init,
    headers: init?.body ? { "content-type": "application/json", ...init.headers } : init?.headers
  });
  if (
    response.status === 401 ||
    response.status === 403 ||
    response.headers.get("content-type")?.includes("text/html")
  ) {
    throw new SignInRequired("Sign in to ScholarServer again, then retry.");
  }
  const value = (await response.json().catch(() => null)) as T | { error?: string } | null;
  if (!response.ok || value === null)
    throw new Error((value as { error?: string } | null)?.error ?? "Docling returned an unreadable response");
  return value as T;
}

function currentTab(): Tab {
  const value = window.location.pathname.split("/").filter(Boolean).at(-1);
  return tabs.some((tab) => tab.id === value) ? (value as Tab) : "queue";
}

function bytes(value: number): string {
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} KiB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MiB`;
}

function when(value: string | null): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function badge(state: JobState): string {
  return `ss-badge ${state === "succeeded" ? "ss-badge-success" : state === "failed" ? "ss-badge-error" : state === "running" ? "ss-badge-warning" : ""}`;
}

export function App() {
  const [tab, setTab] = useState<Tab>(currentTab);
  const [status, setStatus] = useState<Status | null>(null);
  const statusRead = useRef<AbortController | null>(null);
  const [statusPending, setStatusPending] = useState(true);
  const blocked = useRef(false);
  const [accessBlocked, setAccessBlocked] = useState(false);
  const [files, setFiles] = useState<FileEntry[]>([]);
  const filesRead = useRef<AbortController | null>(null);
  const [filesLoaded, setFilesLoaded] = useState(false);
  const [filesPending, setFilesPending] = useState(false);
  const [filesError, setFilesError] = useState<string | null>(null);
  const [settings, setSettings] = useState<Settings>({ defaultOcr: false });
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [settingsPending, setSettingsPending] = useState(true);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const settingsRead = useRef<AbortController | null>(null);
  const ocrEdited = useRef(false);
  const [sourcePath, setSourcePath] = useState("");
  const [attachmentKey, setAttachmentKey] = useState("");
  const [ocr, setOcr] = useState(false);
  const [limit, setLimit] = useState(10);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // An expired Manager session invalidates every private observation, including
  // sibling reads that could otherwise complete after the denial.
  const blockReads = useCallback((message: string) => {
    blocked.current = true;
    setAccessBlocked(true);
    for (const current of [statusRead, filesRead, settingsRead]) {
      current.current?.abort();
      current.current = null;
    }
    setStatus(null);
    setFiles([]);
    setFilesLoaded(false);
    setSettingsLoaded(false);
    setStatusPending(false);
    setFilesPending(false);
    setSettingsPending(false);
    setNotice(null);
    setError(null);
    setStatusError(message);
  }, []);

  const refresh = useCallback(async () => {
    if (blocked.current) return;
    statusRead.current?.abort();
    const controller = new AbortController();
    statusRead.current = controller;
    setStatusPending(true);
    setStatusError(null);
    try {
      const next = await request<Status>("status", {
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)])
      });
      if (controller.signal.aborted || statusRead.current !== controller) return;
      setStatus(next);
      setStatusError(null);
    } catch (caught) {
      if (!controller.signal.aborted && statusRead.current === controller) {
        if (caught instanceof SignInRequired) {
          blockReads(caught.message);
          return;
        }
        setStatusError(caught instanceof Error ? caught.message : "Could not load the queue");
      }
    } finally {
      if (statusRead.current === controller) {
        statusRead.current = null;
        setStatusPending(false);
      }
    }
  }, [blockReads]);

  const discover = useCallback(async () => {
    if (blocked.current) return;
    filesRead.current?.abort();
    const controller = new AbortController();
    filesRead.current = controller;
    setFilesPending(true);
    setFilesError(null);
    try {
      const result = await request<{ files: FileEntry[] }>("files?limit=100", {
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)])
      });
      if (controller.signal.aborted || filesRead.current !== controller) return;
      setFiles(result.files);
      setFilesLoaded(true);
      setSourcePath((current) => current || result.files[0]?.path || "");
    } catch (caught) {
      if (controller.signal.aborted || filesRead.current !== controller) return;
      if (caught instanceof SignInRequired) {
        blockReads(caught.message);
        return;
      }
      setFilesError(caught instanceof Error ? caught.message : "Could not list PDFs");
    } finally {
      if (filesRead.current === controller) {
        filesRead.current = null;
        setFilesPending(false);
      }
    }
  }, [blockReads]);

  const loadSettings = useCallback(async () => {
    if (blocked.current) return;
    settingsRead.current?.abort();
    const controller = new AbortController();
    settingsRead.current = controller;
    setSettingsError(null);
    setSettingsPending(true);
    try {
      const value = await request<Settings>("settings", {
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)])
      });
      if (controller.signal.aborted || settingsRead.current !== controller) return;
      if (!value || typeof value.defaultOcr !== "boolean") throw new Error("Invalid settings response");
      setSettings(value);
      // Initial defaults may arrive after the user has chosen options for a job.
      if (!ocrEdited.current) setOcr(value.defaultOcr);
      setSettingsLoaded(true);
    } catch (caught) {
      if (!controller.signal.aborted && settingsRead.current === controller) {
        if (caught instanceof SignInRequired) {
          blockReads(caught.message);
          return;
        }
        setSettingsError("Could not load conversion defaults. Check your connection and try again.");
      }
    } finally {
      if (settingsRead.current === controller) {
        settingsRead.current = null;
        setSettingsPending(false);
      }
    }
  }, [blockReads]);

  const editOcr = (value: boolean) => {
    ocrEdited.current = true;
    setOcr(value);
  };

  useEffect(() => {
    void refresh();
    void loadSettings();
    return () => {
      settingsRead.current?.abort();
      statusRead.current?.abort();
      filesRead.current?.abort();
    };
  }, [refresh, loadSettings]);

  const activeJobs = (status?.counts.running ?? 0) + (status?.counts.queued ?? 0);
  useEffect(() => {
    const observe = () => {
      if (document.visibilityState !== "hidden" && !statusRead.current && !blocked.current) void refresh();
    };
    const timer = window.setInterval(observe, activeJobs > 0 ? 3000 : 30000);
    document.addEventListener("visibilitychange", observe);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", observe);
    };
  }, [refresh, activeJobs]);

  useEffect(() => {
    if (tab === "process" && !filesLoaded) void discover();
  }, [discover, filesLoaded, tab]);

  function retryStatus() {
    if (blocked.current) {
      blocked.current = false;
      setAccessBlocked(false);
      void loadSettings();
      if (tab === "process") void discover();
    }
    void refresh();
  }

  useEffect(() => {
    const pop = () => setTab(currentTab());
    window.addEventListener("popstate", pop);
    return () => window.removeEventListener("popstate", pop);
  }, []);

  const navigate = (next: Tab) => {
    window.history.pushState({}, "", `${base}/${next}`);
    setTab(next);
  };

  const run = async (operation: () => Promise<unknown>, success: string) => {
    if (blocked.current) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await operation();
      if (blocked.current) return;
      setNotice(success);
      await refresh();
    } catch (caught) {
      if (caught instanceof SignInRequired) blockReads(caught.message);
      setError(caught instanceof Error ? caught.message : "The operation failed");
    } finally {
      setBusy(false);
    }
  };

  const queueOne = () =>
    run(
      () =>
        request<Job>("jobs", {
          method: "POST",
          body: JSON.stringify({ sourcePath, sourceAttachmentKey: attachmentKey.trim().toUpperCase(), ocr })
        }),
      "The PDF was added to the queue."
    );

  const queueBackfill = async () => {
    if (blocked.current) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await request<{ discovered: number; queued: number; existing: number }>("jobs/backfill", {
        method: "POST",
        body: JSON.stringify({ limit, ocr })
      });
      if (blocked.current) return;
      setNotice(
        `${result.discovered} PDFs checked: ${result.queued} waiting or running, ${result.existing} already converted.`
      );
      await refresh();
    } catch (caught) {
      if (caught instanceof SignInRequired) blockReads(caught.message);
      setError(caught instanceof Error ? caught.message : "Could not queue the backfill");
    } finally {
      setBusy(false);
    }
  };

  const selected = useMemo(() => files.find((file) => file.path === sourcePath), [files, sourcePath]);
  let queueControlLabel = "Queue status not loaded";
  if (status) queueControlLabel = status.state === "paused" ? "Resume queue" : "Pause queue";

  return (
    <ApplicationScreen
      name="Docling"
      description={"Convert PDFs into Markdown for reading, searching and use with AI tools."}
      status={
        status ? (
          <span className={`ss-badge ${status.engine === "available" ? "ss-badge-success" : "ss-badge-warning"}`}>
            {status.engine === "available" ? "Engine ready" : "Engine unavailable"}
          </span>
        ) : (
          <span className="ss-badge">Not checked</span>
        )
      }
      tabs={tabs}
      currentTab={tab}
      onNavigate={navigate}
      notice={notice}
      error={error}
      feedback={
        <SectionFeedback
          pending={statusPending}
          hasData={status !== null}
          label="queue status"
          error={statusError}
          onRetry={retryStatus}
        />
      }
    >
      {tab === "queue" && !accessBlocked ? (
        <div className="ss-stack">
          <div className="ss-grid ss-grid-3">
            <div className="ss-card">
              <div className="ss-metric-label">Actively processing</div>
              <div className="ss-metric-value">{status?.counts.running ?? "—"}</div>
            </div>
            <div className="ss-card">
              <div className="ss-metric-label">Waiting</div>
              <div className="ss-metric-value">{status?.counts.queued ?? "—"}</div>
            </div>
            <div className="ss-card">
              <div className="ss-metric-label">Completed</div>
              <div className="ss-metric-value">{status?.counts.succeeded ?? "—"}</div>
            </div>
          </div>
          <section className="ss-card">
            <div className="ss-toolbar">
              <div>
                <h2>Conversion jobs</h2>
                <p className="ss-card-description">
                  Docling processes one document at a time to keep this server responsive.
                </p>
              </div>
              <button className="ss-button ss-button-secondary" onClick={() => void refresh()} disabled={busy}>
                Refresh
              </button>
            </div>
            {!status ? <div aria-label="Conversion jobs not loaded" style={{ minHeight: "10rem" }} /> : null}
            {status?.jobs.length === 0 ? <p className="ss-empty">No PDFs have been queued yet.</p> : null}
            {status && status.jobs.length > 0 ? (
              <div className="ss-table-wrap">
                <table className="ss-table">
                  <thead>
                    <tr>
                      <th>Document</th>
                      <th>Status</th>
                      <th>Started</th>
                      <th>Result</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {status.jobs.map((job) => (
                      <tr key={job.id}>
                        <td>
                          <strong>{job.sourcePath}</strong>
                          <div className="ss-muted">
                            {bytes(job.sourceBytes)} · {job.profile}
                            {job.sourceAttachmentKey ? ` · Zotero ${job.sourceAttachmentKey}` : ""}
                          </div>
                          {job.error ? <div className="ss-job-error">{job.error}</div> : null}
                        </td>
                        <td>
                          <span className={badge(job.state)}>{job.state}</span>
                          {job.state === "running" ? (
                            <div className="ss-running">
                              <span className="ss-spinner" /> Converting
                            </div>
                          ) : null}
                        </td>
                        <td>{when(job.startedAt ?? job.createdAt)}</td>
                        <td>{job.outputPath ? <code className="ss-code">{job.outputPath}</code> : "—"}</td>
                        <td>
                          {job.state === "failed" ? (
                            <button
                              className="ss-button ss-button-secondary"
                              disabled={busy}
                              onClick={() =>
                                void run(
                                  () => request(`jobs/${job.id}/retry`, { method: "POST" }),
                                  "The job was returned to the queue."
                                )
                              }
                            >
                              Retry
                            </button>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </section>
        </div>
      ) : null}

      {tab === "process" && !accessBlocked ? (
        <div className="ss-process-grid">
          <section className="ss-card ss-stack">
            <div className="ss-toolbar">
              <div>
                <h2>Process one PDF</h2>
                <p className="ss-card-description">Choose a document from the attached research storage.</p>
              </div>
              <button className="ss-button ss-button-ghost" onClick={() => void discover()} disabled={filesPending}>
                Refresh files
              </button>
            </div>
            <SectionFeedback
              pending={filesPending}
              hasData={filesLoaded}
              label="PDFs"
              error={filesError}
              onRetry={() => void discover()}
            />
            {files.length ? (
              <label className="ss-field">
                PDF
                <select className="ss-input" value={sourcePath} onChange={(event) => setSourcePath(event.target.value)}>
                  {sourcePath && !selected ? <option value={sourcePath}>{sourcePath} — no longer listed</option> : null}
                  {files.map((file) => (
                    <option key={file.path} value={file.path}>
                      {file.path} · {bytes(file.bytes)}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {filesLoaded && files.length === 0 ? (
              <div className="ss-empty">No PDFs were found in the attached storage.</div>
            ) : null}
            {!filesLoaded ? (
              <label className="ss-field">
                PDF
                <select className="ss-input" disabled>
                  <option>Not loaded</option>
                </select>
              </label>
            ) : null}
            <label className="ss-field">
              Zotero attachment key{" "}
              <span className="ss-field-help">
                Optional. Add the eight-character key when this file belongs to a Zotero attachment.
              </span>
              <input
                className="ss-input"
                maxLength={8}
                placeholder="ABCD1234"
                value={attachmentKey}
                onChange={(event) => setAttachmentKey(event.target.value.toUpperCase())}
              />
            </label>
            <label className="ss-check">
              <input type="checkbox" checked={ocr} onChange={(event) => editOcr(event.target.checked)} />
              <span>
                <strong>Use OCR</strong>
                <small>Enable for scanned or image-only PDFs. It requires more processing time.</small>
              </span>
            </label>
            <button
              className="ss-button"
              onClick={() => void queueOne()}
              disabled={
                busy ||
                !!filesError ||
                filesPending ||
                !!statusError ||
                !selected ||
                status?.engine !== "available" ||
                (!!attachmentKey && !/^[A-Z0-9]{8}$/.test(attachmentKey))
              }
            >
              {busy ? <span className="ss-spinner" /> : null}Queue this PDF
            </button>
          </section>
          <section className="ss-card ss-stack">
            <div>
              <h2>Convert existing PDFs</h2>
              <p className="ss-card-description">
                Check the first documents in storage and skip anything already converted.
              </p>
            </div>
            <label className="ss-field">
              Maximum PDFs
              <input
                className="ss-input"
                type="number"
                min={1}
                max={100}
                value={limit}
                onChange={(event) => setLimit(Math.max(1, Math.min(100, Number(event.target.value) || 1)))}
              />
            </label>
            <label className="ss-check">
              <input type="checkbox" checked={ocr} onChange={(event) => editOcr(event.target.checked)} />
              <span>
                <strong>Recognise text in scanned pages (OCR)</strong>
                <small>Leave disabled for normal text-based academic PDFs.</small>
              </span>
            </label>
            <button
              className="ss-button ss-button-secondary"
              onClick={() => void queueBackfill()}
              disabled={
                busy ||
                filesPending ||
                !!filesError ||
                !!statusError ||
                files.length === 0 ||
                status?.engine !== "available"
              }
            >
              {busy ? <span className="ss-spinner" /> : null}
              {filesLoaded ? `Queue first ${Math.min(limit, files.length)}` : "Queue PDFs"}
            </button>
          </section>
        </div>
      ) : null}

      {tab === "configuration" && !accessBlocked ? (
        <div className="ss-stack">
          <section className="ss-card ss-stack">
            <div>
              <h2>Conversion defaults</h2>
              <p className="ss-card-description">
                These defaults affect new jobs; existing queue entries remain unchanged.
              </p>
            </div>
            <label className="ss-check">
              <input
                type="checkbox"
                checked={settings.defaultOcr}
                disabled={busy || !settingsLoaded}
                onChange={(event) => setSettings({ defaultOcr: event.target.checked })}
              />
              <span>
                <strong>Use OCR by default</strong>
                <small>Recommended only when most of your library contains scanned pages.</small>
              </span>
            </label>
            <SectionFeedback
              pending={settingsPending}
              hasData={settingsLoaded}
              label="conversion defaults"
              error={settingsError}
              onRetry={() => void loadSettings()}
            />
            <div>
              <button
                className="ss-button"
                disabled={busy || !settingsLoaded}
                onClick={() =>
                  void run(
                    () => request<Settings>("settings", { method: "PUT", body: JSON.stringify(settings) }),
                    "Docling defaults were saved."
                  )
                }
              >
                Save defaults
              </button>
            </div>
          </section>
          <section className="ss-card">
            <div className="ss-toolbar">
              <div>
                <h2>Queue control</h2>
                <p className="ss-card-description">Pause after the current conversion, or resume waiting work.</p>
              </div>
              <button
                className="ss-button ss-button-secondary"
                disabled={busy || !status || !!statusError}
                onClick={() =>
                  void run(
                    () => request(`queue/${status?.state === "paused" ? "resume" : "pause"}`, { method: "POST" }),
                    status?.state === "paused"
                      ? "The queue resumed."
                      : "The queue will remain paused after the active job."
                  )
                }
              >
                {queueControlLabel}
              </button>
            </div>
          </section>
          <section className="ss-card">
            <h2>Service details</h2>
            <dl className="ss-details">
              <dt>Engine</dt>
              <dd>{status?.engine ?? "—"}</dd>
              <dt>Parallel jobs</dt>
              <dd>{status?.workerConcurrency ?? "—"}</dd>
              <dt>Markdown folder</dt>
              <dd>
                <code>{status?.outputFolder ?? "—"}</code>
              </dd>
              <dt>Last checked</dt>
              <dd>{when(status?.updatedAt ?? null)}</dd>
            </dl>
          </section>
        </div>
      ) : null}
    </ApplicationScreen>
  );
}
