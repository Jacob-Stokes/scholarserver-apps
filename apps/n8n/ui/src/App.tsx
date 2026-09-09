import { ApplicationScreen } from "@scholarserver/ui/application-screen";
import { SetupPanel } from "@scholarserver/ui/setup-pipeline";
import { type FormEvent, useEffect, useState } from "react";
import { InstallAutomation, type Schedule } from "./InstallAutomation";

type Receipt = { state: string; workflowId: string | null; operationId: string };
type Inventory = {
  templates: { id: string; name: string; description: string; schedule: Schedule | null }[];
  installations: Record<string, Receipt>;
  workflows: { id: string; name: string; active: boolean; hoursInterval: number | null }[];
  moreAvailable: boolean;
};
type Run = { id: string; status: string; startedAt: string; stoppedAt: string | null };
const base = window.location.pathname.match(/^(.*\/apps\/[^/]+)/)?.[1] ?? "";
const tabs = [
  { id: "automations", label: "Automations" },
  { id: "configuration", label: "Configuration" }
];

async function request<T>(route: string, body?: unknown): Promise<T> {
  const response = await fetch(`${base}/api/${route}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { "content-type": "application/json", "x-requested-with": "ScholarServer" },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? "The request could not be completed");
  return result;
}

export function App() {
  const [tab, setTab] = useState("automations");
  const [connected, setConnected] = useState<boolean | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [inventory, setInventory] = useState<Inventory | null>(null);
  const [runs, setRuns] = useState<{ templateId: string; values: Run[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    const status = await request<{ connected: boolean }>("status");
    setConnected(status.connected);
    if (status.connected) {
      setInventory(await request<Inventory>("automations"));
    } else {
      setInventory(null);
    }
  }
  useEffect(() => {
    void refresh().catch(() => {
      setConnected(false);
      setError("Could not check the saved n8n connection.");
    });
  }, []);

  async function act(operation: () => Promise<unknown>, refreshAfter = true) {
    setBusy(true);
    setError(null);
    try {
      await operation();
      if (refreshAfter) await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not complete the request");
    } finally {
      setBusy(false);
    }
  }
  function connect(event: FormEvent) {
    event.preventDefault();
    void act(async () => {
      await request("connect", { apiKey });
      setApiKey("");
    });
  }
  const managedIds = new Set(Object.values(inventory?.installations ?? {}).map((receipt) => receipt.workflowId));
  const otherWorkflows = inventory?.workflows.filter((workflow) => !managedIds.has(workflow.id)) ?? [];

  return (
    <ApplicationScreen
      name="Automations"
      description="Configure workflows with n8n."
      tabs={tabs}
      currentTab={tab}
      onNavigate={setTab}
      loading={connected === null}
      error={error}
    >
      {connected === false || tab === "configuration" ? (
        <SetupPanel
          title="Connect n8n"
          stage={1}
          total={1}
          description="Allow ScholarServer to manage workflows in this installation."
        >
          <p>
            Open n8n from its application shortcut and create your owner account. In Settings → n8n API, create a key
            with workflow and credential permissions.
          </p>
          <p>
            The key is stored on your server. Workflow credentials stay in n8n. This initial connection currently
            requires opening n8n once.
          </p>
          <form onSubmit={connect} className="ss-stack">
            <label htmlFor="n8n-api-key">n8n API key</label>
            <input
              id="n8n-api-key"
              className="ss-input"
              type="password"
              autoComplete="off"
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              required
            />
            <button className="ss-button" disabled={busy || !apiKey.trim()}>
              {busy ? "Checking…" : "Save connection"}
            </button>
          </form>
        </SetupPanel>
      ) : null}
      {connected && tab === "automations" ? (
        <div className="ss-stack">
          <div className="ss-section-heading">
            <h2>Automation catalog</h2>
            <button className="ss-button ss-button-secondary" disabled={busy} onClick={() => void act(refresh, false)}>
              Refresh status
            </button>
          </div>
          {inventory?.templates.map((template) => {
            const receipt = inventory.installations[template.id];
            const workflow = inventory.workflows.find((value) => value.id === receipt?.workflowId);
            return (
              <section className="ss-card ss-stack" key={template.id}>
                <h3>{template.name}</h3>
                <p>{template.description}</p>
                {!receipt || receipt.state === "rejected" ? (
                  <InstallAutomation
                    schedule={template.schedule}
                    retry={receipt?.state === "rejected"}
                    busy={busy}
                    onInstall={(settings) =>
                      void act(() =>
                        request("install", {
                          templateId: template.id,
                          settings,
                          retryOperationId: receipt?.operationId
                        })
                      )
                    }
                  />
                ) : null}
                {receipt?.state === "installed" ? (
                  <>
                    <p>{workflow?.active ? "Scheduled" : "Not scheduled"}</p>
                    {typeof workflow?.hoursInterval === "number" ? (
                      <p>Runs every {workflow.hoursInterval} hours when enabled.</p>
                    ) : null}
                    <button
                      className="ss-button"
                      disabled={busy || !workflow}
                      onClick={() =>
                        void act(() => request("enabled", { templateId: template.id, enabled: !workflow?.active }))
                      }
                    >
                      {workflow?.active ? "Disable schedule" : "Enable schedule"}
                    </button>
                    <button
                      className="ss-button ss-button-secondary"
                      disabled={busy}
                      onClick={() =>
                        void act(async () => {
                          const result = await request<{ runs: Run[] }>(
                            `runs?templateId=${encodeURIComponent(template.id)}`
                          );
                          setRuns({ templateId: template.id, values: result.runs });
                        })
                      }
                    >
                      Show recent runs
                    </button>
                    {!workflow ? (
                      <p role="alert">
                        The workflow is not in the current inventory. Check it in n8n before making changes.
                      </p>
                    ) : null}
                  </>
                ) : null}
                {receipt && receipt.state !== "installed" && receipt.state !== "rejected" ? (
                  <>
                    <p>Installation status: {receipt.state}. Do not add another copy until this is resolved.</p>
                    <button
                      className="ss-button"
                      disabled={busy}
                      onClick={() => void act(() => request("reconcile", { templateId: template.id }))}
                    >
                      Check installation
                    </button>
                  </>
                ) : null}
                {runs?.templateId === template.id ? (
                  <ul>
                    {runs.values.length ? (
                      runs.values.map((run) => (
                        <li key={run.id}>
                          {run.status} · {new Date(run.startedAt).toLocaleString()}
                        </li>
                      ))
                    ) : (
                      <li>No recorded runs.</li>
                    )}
                  </ul>
                ) : null}
              </section>
            );
          })}
          <section className="ss-card">
            <h2>Other n8n workflows</h2>
            <p>Workflows created directly in n8n are listed here without changing them. Open n8n to edit them.</p>
            <ul>
              {otherWorkflows.map((workflow) => (
                <li key={workflow.id}>
                  {workflow.name} — {workflow.active ? "Scheduled" : "Inactive"}
                </li>
              ))}
            </ul>
            {inventory?.moreAvailable ? <p>More workflows are available in n8n.</p> : null}
          </section>
        </div>
      ) : null}
    </ApplicationScreen>
  );
}
