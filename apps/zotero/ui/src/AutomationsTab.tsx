import { FolderPicker, type FolderListing } from "@scholarserver/ui/folder-picker";
import { useCallback, useEffect, useState } from "react";

type AutomationView = {
  definition: {
    id: string;
    name: string;
    description: string;
    requires: string[];
    scheduling: { defaultIntervalMinutes: number; minimumIntervalMinutes: number };
  };
  configuration: {
    enabled: boolean;
    intervalMinutes: number;
    configuration: { folder: string; limit: number; ocr: boolean; attachMarkdown: boolean };
    updatedAt: string;
    runs: Array<{
      id: string; state: "running" | "succeeded" | "failed"; trigger: "manual" | "scheduled";
      startedAt: string; finishedAt: string | null; summary: Record<string, number> | null; error: string | null;
    }>;
  };
  readiness: { ready: boolean; message: string };
};

type Update = { enabled: boolean; intervalMinutes: number; configuration: AutomationView["configuration"]["configuration"] };

function when(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

export function AutomationsTab({ request, setNotice, setError }: {
  request: <T>(url: string, init?: RequestInit) => Promise<T>;
  setNotice: (message: string | null) => void;
  setError: (message: string | null) => void;
}) {
  const [view, setView] = useState<AutomationView | null>(null);
  const [draft, setDraft] = useState<Update | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const result = await request<{ automations: AutomationView[] }>("automations");
      const next = result.automations[0] ?? null;
      setView(next);
      setDraft((current) => current ?? (next ? { enabled: next.configuration.enabled, intervalMinutes: next.configuration.intervalMinutes, configuration: { ...next.configuration.configuration } } : null));
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not load Zotero automations"); }
  }, [request, setError]);

  useEffect(() => { void refresh(); const timer = window.setInterval(() => void refresh(), 5000); return () => window.clearInterval(timer); }, [refresh]);

  const browse = (folder: string) => request<FolderListing>(`automations/folders?path=${encodeURIComponent(folder)}`);
  const save = async () => {
    if (!view || !draft) return;
    setBusy(true); setError(null); setNotice(null);
    try {
      await request(`automations/${view.definition.id}`, { method: "PUT", body: JSON.stringify(draft) });
      setNotice("Automation settings were saved.");
      await refresh();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not save the automation"); }
    finally { setBusy(false); }
  };
  const runNow = async () => {
    if (!view) return;
    setBusy(true); setError(null); setNotice(null);
    try {
      await request(`automations/${view.definition.id}/runs`, { method: "POST", body: "{}" });
      setNotice("The Zotero PDF conversion started. You can leave this page while it works.");
      await refresh();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not start the automation"); }
    finally { setBusy(false); }
  };

  if (!view || !draft) return <div className="ss-card ss-loading"><span className="ss-spinner" />Loading Zotero automations…</div>;
  const config = draft.configuration;
  return <div className="ss-stack">
    <section className="ss-card ss-stack">
      <div className="ss-toolbar"><div><h2>{view.definition.name}</h2><p className="ss-card-description">{view.definition.description}</p></div><span className={`ss-badge ${view.readiness.ready ? "ss-badge-success" : "ss-badge-warning"}`}>{view.readiness.ready ? "Ready" : "Needs Docling"}</span></div>
      {!view.readiness.ready ? <div className="ss-callout ss-callout-warning">{view.readiness.message}</div> : null}
      <FolderPicker label="PDF folder" help="Choose a folder inside the shared attachment storage. Leave it at the root to include everything." value={config.folder} disabled={busy} onChange={(folder) => setDraft({ ...draft, configuration: { ...config, folder } })} browse={browse} />
      <label className="ss-field">PDFs per run<input className="ss-input" type="number" min={1} max={100} value={config.limit} onChange={(event) => setDraft({ ...draft, configuration: { ...config, limit: Number(event.target.value) } })} /><span className="ss-field-help">Start small. Existing conversions with the same settings are reused.</span></label>
      <label className="ss-check"><input type="checkbox" checked={config.ocr} onChange={(event) => setDraft({ ...draft, configuration: { ...config, ocr: event.target.checked } })} /><span><strong>Use OCR</strong><small>Enable for scanned or image-only PDFs; it requires considerably more processing power.</small></span></label>
      <label className="ss-check"><input type="checkbox" checked={config.attachMarkdown} onChange={(event) => setDraft({ ...draft, configuration: { ...config, attachMarkdown: event.target.checked } })} /><span><strong>Attach Markdown to Zotero</strong><small>Add the converted Markdown beside its source PDF in the Zotero item.</small></span></label>
      <label className="ss-check"><input type="checkbox" checked={draft.enabled} onChange={(event) => setDraft({ ...draft, enabled: event.target.checked })} /><span><strong>Run automatically</strong><small>Keep this off while testing; you can always use Run now.</small></span></label>
      {draft.enabled ? <label className="ss-field">Run every<select className="ss-input" value={draft.intervalMinutes} onChange={(event) => setDraft({ ...draft, intervalMinutes: Number(event.target.value) })}><option value={15}>15 minutes</option><option value={30}>30 minutes</option><option value={60}>1 hour</option><option value={360}>6 hours</option><option value={1440}>Daily</option></select></label> : null}
      <div className="ss-form-actions"><button className="ss-button ss-button-secondary" disabled={busy} onClick={() => void save()}>{busy ? <span className="ss-spinner" /> : null}Save settings</button><button className="ss-button" disabled={busy || !view.readiness.ready} onClick={() => void runNow()}>{busy ? <span className="ss-spinner" /> : null}Run now</button></div>
    </section>
    <section className="ss-card"><div className="ss-toolbar"><div><h2>Recent runs</h2><p className="ss-card-description">Progress and failures stay with the Zotero stack.</p></div><button className="ss-button ss-button-secondary" onClick={() => void refresh()}>Refresh</button></div>{view.configuration.runs.length === 0 ? <p className="ss-muted">This automation has not run yet.</p> : <div className="ss-run-list">{view.configuration.runs.map((run) => <div className="ss-run" key={run.id}><div><span className={`ss-badge ${run.state === "succeeded" ? "ss-badge-success" : run.state === "failed" ? "ss-badge-error" : "ss-badge-warning"}`}>{run.state}</span><strong>{run.trigger === "scheduled" ? "Scheduled run" : "Manual run"}</strong><small>{when(run.startedAt)}</small></div>{run.summary ? <p>{run.summary.discovered ?? 0} found · {run.summary.converted ?? 0} converted · {run.summary.attached ?? 0} attached</p> : null}{run.error ? <p className="ss-run-error">{run.error}</p> : null}</div>)}</div>}</section>
  </div>;
}
