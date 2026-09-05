import { useCallback, useEffect, useMemo, useState } from "react";

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

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${base}/api/${path}`, {
    ...init,
    headers: init?.body ? { "content-type": "application/json", ...init.headers } : init?.headers
  });
  const value = (await response.json().catch(() => null)) as T | { error?: string } | null;
  if (!response.ok) throw new Error((value as { error?: string } | null)?.error ?? "Docling request failed");
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
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [settings, setSettings] = useState<Settings>({ defaultOcr: false });
  const [sourcePath, setSourcePath] = useState("");
  const [attachmentKey, setAttachmentKey] = useState("");
  const [ocr, setOcr] = useState(false);
  const [limit, setLimit] = useState(10);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const next = await request<Status>("status");
      setStatus(next);
      setStatusError(null);
    } catch (caught) {
      setStatusError(caught instanceof Error ? caught.message : "Could not load the queue");
    }
  }, []);

  const discover = useCallback(async () => {
    try {
      const result = await request<{ files: FileEntry[] }>("files?limit=100");
      setFiles(result.files);
      setSourcePath((current) => current || result.files[0]?.path || "");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not list PDFs");
    }
  }, []);

  useEffect(() => {
    void refresh();
    void request<Settings>("settings")
      .then((value) => {
        setSettings(value);
        setOcr(value.defaultOcr);
      })
      .catch(() => undefined);
    const timer = window.setInterval(() => void refresh(), 3000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  useEffect(() => {
    if (tab === "process" && files.length === 0) void discover();
  }, [discover, files.length, tab]);

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
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await operation();
      setNotice(success);
      await refresh();
    } catch (caught) {
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
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await request<{ discovered: number; queued: number; existing: number }>("jobs/backfill", {
        method: "POST",
        body: JSON.stringify({ limit, ocr })
      });
      setNotice(
        `${result.discovered} PDFs checked: ${result.queued} waiting or running, ${result.existing} already converted.`
      );
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not queue the backfill");
    } finally {
      setBusy(false);
    }
  };

  const selected = useMemo(() => files.find((file) => file.path === sourcePath), [files, sourcePath]);

  return (
    <div className="ss-app">
      <header className="ss-app-header">
        <div className="ss-app-header-inner">
          <div className="ss-brand">
            <div className="ss-brand-mark">S</div>
            <div>
              <p className="ss-brand-title">ScholarServer</p>
              <p className="ss-brand-context">Docling</p>
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
            <h1>Docling</h1>
            <p>Convert research PDFs into durable, AI-readable Markdown without blocking the rest of your workspace.</p>
          </div>
          {status ? (
            <span className={`ss-badge ${status.engine === "available" ? "ss-badge-success" : "ss-badge-warning"}`}>
              {status.engine === "available" ? "Engine ready" : "Engine unavailable"}
            </span>
          ) : null}
        </div>
        <nav className="ss-tabs" aria-label="Docling sections">
          {tabs.map((item) => (
            <button key={item.id} className="ss-tab" aria-selected={tab === item.id} onClick={() => navigate(item.id)}>
              {item.label}
            </button>
          ))}
        </nav>
        {notice ? <div className="ss-alert ss-alert-success">{notice}</div> : null}
        {error || statusError ? (
          <div className="ss-alert ss-alert-error" role="alert">
            {error || statusError}
          </div>
        ) : null}
        {!status ? (
          <div className="ss-card ss-loading">
            <span className="ss-spinner" /> Loading Docling…
          </div>
        ) : null}

        {status && tab === "queue" ? (
          <div className="ss-stack">
            <div className="ss-grid ss-grid-3">
              <div className="ss-card">
                <div className="ss-metric-label">Actively processing</div>
                <div className="ss-metric-value">{status.counts.running}</div>
              </div>
              <div className="ss-card">
                <div className="ss-metric-label">Waiting</div>
                <div className="ss-metric-value">{status.counts.queued}</div>
              </div>
              <div className="ss-card">
                <div className="ss-metric-label">Completed</div>
                <div className="ss-metric-value">{status.counts.succeeded}</div>
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
              {status.jobs.length === 0 ? (
                <p className="ss-empty">No PDFs have been queued yet.</p>
              ) : (
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
              )}
            </section>
          </div>
        ) : null}

        {status && tab === "process" ? (
          <div className="ss-process-grid">
            <section className="ss-card ss-stack">
              <div className="ss-toolbar">
                <div>
                  <h2>Process one PDF</h2>
                  <p className="ss-card-description">Choose a document from the attached research storage.</p>
                </div>
                <button className="ss-button ss-button-ghost" onClick={() => void discover()}>
                  Refresh files
                </button>
              </div>
              {files.length ? (
                <label className="ss-field">
                  PDF
                  <select
                    className="ss-input"
                    value={sourcePath}
                    onChange={(event) => setSourcePath(event.target.value)}
                  >
                    {files.map((file) => (
                      <option key={file.path} value={file.path}>
                        {file.path} · {bytes(file.bytes)}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <div className="ss-empty">No PDFs were found in the attached storage.</div>
              )}
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
                <input type="checkbox" checked={ocr} onChange={(event) => setOcr(event.target.checked)} />
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
                  !selected ||
                  status.engine !== "available" ||
                  (!!attachmentKey && !/^[A-Z0-9]{8}$/.test(attachmentKey))
                }
              >
                {busy ? <span className="ss-spinner" /> : null}Queue this PDF
              </button>
            </section>
            <section className="ss-card ss-stack">
              <div>
                <h2>Small backfill</h2>
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
                <input type="checkbox" checked={ocr} onChange={(event) => setOcr(event.target.checked)} />
                <span>
                  <strong>Use OCR for this backfill</strong>
                  <small>Leave disabled for normal text-based academic PDFs.</small>
                </span>
              </label>
              <button
                className="ss-button ss-button-secondary"
                onClick={() => void queueBackfill()}
                disabled={busy || files.length === 0 || status.engine !== "available"}
              >
                {busy ? <span className="ss-spinner" /> : null}Queue first {Math.min(limit, files.length)}
              </button>
            </section>
          </div>
        ) : null}

        {status && tab === "configuration" ? (
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
                  onChange={(event) => setSettings({ defaultOcr: event.target.checked })}
                />
                <span>
                  <strong>Use OCR by default</strong>
                  <small>Recommended only when most of your library contains scanned pages.</small>
                </span>
              </label>
              <div>
                <button
                  className="ss-button"
                  disabled={busy}
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
                  disabled={busy}
                  onClick={() =>
                    void run(
                      () => request(`queue/${status.state === "paused" ? "resume" : "pause"}`, { method: "POST" }),
                      status.state === "paused"
                        ? "The queue resumed."
                        : "The queue will remain paused after the active job."
                    )
                  }
                >
                  {status.state === "paused" ? "Resume queue" : "Pause queue"}
                </button>
              </div>
            </section>
            <section className="ss-card">
              <h2>Service details</h2>
              <dl className="ss-details">
                <dt>Engine</dt>
                <dd>{status.engine}</dd>
                <dt>Parallel jobs</dt>
                <dd>{status.workerConcurrency}</dd>
                <dt>Markdown folder</dt>
                <dd>
                  <code>{status.outputFolder}</code>
                </dd>
                <dt>Last checked</dt>
                <dd>{when(status.updatedAt)}</dd>
              </dl>
            </section>
          </div>
        ) : null}
      </main>
    </div>
  );
}
