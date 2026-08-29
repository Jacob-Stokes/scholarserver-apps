import { FolderPicker, type FolderListing } from "@scholarserver/ui/folder-picker";
import { ArrowLeft, ChevronRight, CircleAlert, CircleCheck, Clock3, Play, Search, Zap } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

type AutomationRun = {
  id: string;
  state: "running" | "succeeded" | "failed";
  trigger: "manual" | "scheduled";
  startedAt: string;
  finishedAt: string | null;
  summary: Record<string, number> | null;
  error: string | null;
};

type AutomationView = {
  definition: {
    id: string;
    name: string;
    description: string;
    category: string;
    keywords: string[];
    requires: string[];
    scheduling: { defaultIntervalMinutes: number; minimumIntervalMinutes: number };
  };
  configuration: {
    active: boolean;
    enabled: boolean;
    intervalMinutes: number;
    configuration: { folder: string; limit: number; ocr: boolean; attachMarkdown: boolean };
    updatedAt: string;
    runs: AutomationRun[];
  };
  readiness: { ready: boolean; message: string };
};

type Update = {
  active: boolean;
  enabled: boolean;
  intervalMinutes: number;
  configuration: AutomationView["configuration"]["configuration"];
};
type Draft = { id: string; value: Update };
type Filter = "all" | "active" | "attention" | "inactive";

function when(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function updateFrom(view: AutomationView): Update {
  return {
    active: view.configuration.active,
    enabled: view.configuration.enabled,
    intervalMinutes: view.configuration.intervalMinutes,
    configuration: { ...view.configuration.configuration }
  };
}

function routeAutomationId(base: string): string | null {
  const relative = base && window.location.pathname.startsWith(base)
    ? window.location.pathname.slice(base.length)
    : window.location.pathname;
  const segments = relative.split("/").filter(Boolean);
  const position = segments.indexOf("automations");
  if (position < 0 || !segments[position + 1]) return null;
  try { return decodeURIComponent(segments[position + 1]); } catch { return null; }
}

function statusFor(view: AutomationView) {
  if (view.configuration.runs.some((run) => run.state === "running")) return { label: "Running", className: "ss-badge-warning", filter: "active" as Filter };
  if (!view.configuration.active) return { label: "Inactive", className: "", filter: "inactive" as Filter };
  if (!view.readiness.ready) return { label: "Needs attention", className: "ss-badge-warning", filter: "attention" as Filter };
  if (view.configuration.enabled) return { label: "Scheduled", className: "ss-badge-success", filter: "active" as Filter };
  return { label: "Active", className: "ss-badge-success", filter: "active" as Filter };
}

function dependencyName(value: string) {
  return value.split(".").at(-1)?.replaceAll("-", " ") ?? value;
}

export function AutomationsTab({ base, request, setNotice, setError }: {
  base: string;
  request: <T>(url: string, init?: RequestInit) => Promise<T>;
  setNotice: (message: string | null) => void;
  setError: (message: string | null) => void;
}) {
  const [views, setViews] = useState<AutomationView[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(() => routeAutomationId(base));
  const [draft, setDraft] = useState<Draft | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const result = await request<{ automations: AutomationView[] }>("automations");
      setViews(result.automations);
      setLoaded(true);
    } catch (caught) {
      setLoaded(true);
      setError(caught instanceof Error ? caught.message : "Could not load Zotero automations");
    }
  }, [request, setError]);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 5000);
    return () => window.clearInterval(timer);
  }, [refresh]);
  useEffect(() => {
    const pop = () => { setSelectedId(routeAutomationId(base)); setDraft(null); };
    window.addEventListener("popstate", pop);
    return () => window.removeEventListener("popstate", pop);
  }, [base]);

  const selected = views.find((view) => view.definition.id === selectedId) ?? null;
  useEffect(() => {
    if (!selected) return setDraft(null);
    setDraft((current) => current?.id === selected.definition.id
      ? current
      : { id: selected.definition.id, value: updateFrom(selected) });
  }, [selected?.definition.id, selected?.configuration.updatedAt]);

  const navigate = (id: string | null) => {
    window.history.pushState({}, "", `${base}/automations${id ? `/${encodeURIComponent(id)}` : ""}`);
    setSelectedId(id);
    setDraft(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const saveValue = async (view: AutomationView, value: Update, message: string) => {
    setBusy(true); setError(null); setNotice(null);
    try {
      await request(`automations/${view.definition.id}`, { method: "PUT", body: JSON.stringify(value) });
      setDraft((current) => current?.id === view.definition.id ? { id: view.definition.id, value } : current);
      setNotice(message);
      await refresh();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not update the automation"); }
    finally { setBusy(false); }
  };
  const activate = (view: AutomationView, active: boolean, value = updateFrom(view)) => saveValue(
    view,
    { ...value, active, enabled: active && value.enabled },
    active ? `${view.definition.name} was activated.` : `${view.definition.name} was deactivated.`
  );
  const runNow = async (view: AutomationView) => {
    setBusy(true); setError(null); setNotice(null);
    try {
      await request(`automations/${view.definition.id}/runs`, { method: "POST", body: "{}" });
      setNotice(`${view.definition.name} started. You can leave this page while it works.`);
      await refresh();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not start the automation"); }
    finally { setBusy(false); }
  };

  const visible = useMemo(() => {
    const term = query.trim().toLocaleLowerCase();
    return views.filter((view) => {
      const status = statusFor(view);
      if (filter !== "all" && status.filter !== filter) return false;
      if (!term) return true;
      return [view.definition.name, view.definition.description, view.definition.category, ...view.definition.keywords]
        .join(" ").toLocaleLowerCase().includes(term);
    });
  }, [views, query, filter]);

  if (!loaded) return <div className="ss-card ss-loading"><span className="ss-spinner" />Loading Zotero automations…</div>;
  if (selectedId && !selected) return <section className="ss-card ss-empty-state"><CircleAlert size={28} /><h2>Automation unavailable</h2><p>This automation is not included in the installed Zotero package.</p><button className="ss-button ss-button-secondary" onClick={() => navigate(null)}>Back to automations</button></section>;

  if (!selected || !draft) return <div className="ss-stack">
    <div className="ss-section-heading"><div><h2>Automation catalogue</h2><p>Choose a ready-made Zotero workflow, activate it, then configure how and when it runs.</p></div><span className="ss-badge">{views.length} available</span></div>
    <div className="ss-catalog-toolbar">
      <label className="ss-search-field"><Search size={17} /><span className="ss-visually-hidden">Search automations</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search automations" /></label>
      <label className="ss-visually-hidden" htmlFor="automation-filter">Filter automations</label>
      <select id="automation-filter" className="ss-input ss-filter-select" value={filter} onChange={(event) => setFilter(event.target.value as Filter)}><option value="all">All automations</option><option value="active">Active</option><option value="attention">Needs attention</option><option value="inactive">Inactive</option></select>
    </div>
    {visible.length ? <div className="ss-automation-grid">{visible.map((view) => {
      const status = statusFor(view);
      const latest = view.configuration.runs[0];
      return <article className="ss-automation-card" key={view.definition.id}>
        <div className="ss-automation-card-top"><span className="ss-automation-icon"><Zap size={19} /></span><span className={`ss-badge ${status.className}`}>{status.label}</span></div>
        <div><p className="ss-eyebrow">{view.definition.category}</p><h3>{view.definition.name}</h3><p className="ss-card-description">{view.definition.description}</p></div>
        <div className="ss-automation-meta"><span>{view.definition.requires.map(dependencyName).join(", ")} required</span>{latest ? <span>Last run {when(latest.startedAt)}</span> : <span>Never run</span>}</div>
        <div className="ss-automation-card-actions">{view.configuration.active
          ? <button className="ss-button ss-button-secondary" disabled={busy} onClick={() => void activate(view, false)}>Deactivate</button>
          : <button className="ss-button ss-button-secondary" disabled={busy} onClick={() => void activate(view, true)}>Activate</button>}
          <button className="ss-button" onClick={() => navigate(view.definition.id)}>View details<ChevronRight size={16} /></button></div>
      </article>;
    })}</div> : <section className="ss-card ss-empty-state"><Search size={28} /><h3>No automations found</h3><p>Try a different search or status filter.</p><button className="ss-button ss-button-secondary" onClick={() => { setQuery(""); setFilter("all"); }}>Clear filters</button></section>}
  </div>;

  const value = draft.value;
  const config = value.configuration;
  const status = statusFor(selected);
  const browse = (folder: string) => request<FolderListing>(`automations/folders?path=${encodeURIComponent(folder)}`);
  return <div className="ss-stack">
    <button className="ss-back-link" onClick={() => navigate(null)}><ArrowLeft size={16} />All automations</button>
    <div className="ss-automation-detail-heading"><div className="ss-automation-icon ss-automation-icon-large"><Zap size={22} /></div><div><div className="ss-toolbar"><p className="ss-eyebrow">{selected.definition.category}</p><span className={`ss-badge ${status.className}`}>{status.label}</span></div><h2>{selected.definition.name}</h2><p>{selected.definition.description}</p><div className="ss-dependency-list">{selected.definition.requires.map((dependency) => <span key={dependency}><CircleCheck size={14} />{dependencyName(dependency)}</span>)}</div></div></div>
    {!selected.readiness.ready ? <div className="ss-callout ss-callout-warning"><strong>Dependency unavailable.</strong> {selected.readiness.message} Scheduled work is paused until it recovers.</div> : null}

    <section className="ss-card"><div className="ss-toolbar"><div><h3>Activation</h3><p className="ss-card-description">Activated automations can be configured and run. Activation does not start a schedule.</p></div><button className={`ss-button ${value.active ? "ss-button-secondary" : ""}`} disabled={busy} onClick={() => void activate(selected, !value.active, value)}>{value.active ? "Deactivate" : "Activate automation"}</button></div></section>

    <fieldset className="ss-automation-settings" disabled={!value.active || busy}>
      <section className="ss-card ss-stack">
        <div><h3>Configuration</h3><p className="ss-card-description">Choose which Zotero PDFs are processed and what happens to the result.</p></div>
        <FolderPicker label="PDF folder" help="Choose a folder inside the shared attachment storage. Leave it at the root to include everything." value={config.folder} disabled={busy || !value.active} onChange={(folder) => setDraft({ id: draft.id, value: { ...value, configuration: { ...config, folder } } })} browse={browse} />
        <label className="ss-field">PDFs per run<input className="ss-input" type="number" min={1} max={100} value={config.limit} onChange={(event) => setDraft({ id: draft.id, value: { ...value, configuration: { ...config, limit: Number(event.target.value) } } })} /><span className="ss-field-help">Start small. Existing conversions with the same settings are reused.</span></label>
        <label className="ss-check"><input type="checkbox" checked={config.ocr} onChange={(event) => setDraft({ id: draft.id, value: { ...value, configuration: { ...config, ocr: event.target.checked } } })} /><span><strong>Use OCR</strong><small>Enable for scanned or image-only PDFs; it requires considerably more processing power.</small></span></label>
        <label className="ss-check"><input type="checkbox" checked={config.attachMarkdown} onChange={(event) => setDraft({ id: draft.id, value: { ...value, configuration: { ...config, attachMarkdown: event.target.checked } } })} /><span><strong>Attach Markdown to Zotero</strong><small>Add the converted Markdown beside its source PDF in the Zotero item.</small></span></label>
      </section>
      <section className="ss-card ss-stack">
        <div className="ss-toolbar"><div><h3>Schedule</h3><p className="ss-card-description">Leave automatic runs off and use Run now, or choose a recurring interval.</p></div><Clock3 size={20} className="ss-muted" /></div>
        <label className="ss-check"><input type="checkbox" checked={value.enabled} onChange={(event) => setDraft({ id: draft.id, value: { ...value, enabled: event.target.checked } })} /><span><strong>Run automatically</strong><small>The schedule pauses whenever Docling is unavailable.</small></span></label>
        {value.enabled ? <label className="ss-field">Run every<select className="ss-input" value={value.intervalMinutes} onChange={(event) => setDraft({ id: draft.id, value: { ...value, intervalMinutes: Number(event.target.value) } })}><option value={15}>15 minutes</option><option value={30}>30 minutes</option><option value={60}>1 hour</option><option value={360}>6 hours</option><option value={1440}>Daily</option></select></label> : null}
        <div className="ss-form-actions"><button className="ss-button ss-button-secondary" disabled={busy} onClick={() => void saveValue(selected, value, "Automation settings were saved.")}>Save settings</button><button className="ss-button" disabled={busy || !selected.readiness.ready} onClick={() => void runNow(selected)}><Play size={16} />Run now</button></div>
      </section>
    </fieldset>
    {!value.active ? <div className="ss-callout"><strong>This automation is inactive.</strong> Activate it to configure or run it.</div> : null}

    <section className="ss-card"><div className="ss-toolbar"><div><h3>Recent runs</h3><p className="ss-card-description">Progress and failures stay with the Zotero stack.</p></div><button className="ss-button ss-button-secondary" onClick={() => void refresh()}>Refresh</button></div>{selected.configuration.runs.length === 0 ? <p className="ss-muted">This automation has not run yet.</p> : <div className="ss-run-list">{selected.configuration.runs.map((run) => <div className="ss-run" key={run.id}><div><span className={`ss-badge ${run.state === "succeeded" ? "ss-badge-success" : run.state === "failed" ? "ss-badge-error" : "ss-badge-warning"}`}>{run.state}</span><strong>{run.trigger === "scheduled" ? "Scheduled run" : "Manual run"}</strong><small>{when(run.startedAt)}</small></div>{run.summary ? <p>{run.summary.discovered ?? 0} found · {run.summary.converted ?? 0} converted · {run.summary.attached ?? 0} attached</p> : null}{run.error ? <p className="ss-run-error">{run.error}</p> : null}</div>)}</div>}</section>
  </div>;
}
