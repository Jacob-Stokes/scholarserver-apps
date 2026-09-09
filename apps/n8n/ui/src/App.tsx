import { ApplicationScreen } from "@scholarserver/ui/application-screen";
import { useEffect, useState } from "react";
import { ConnectionSetup, type ConnectionStatus } from "./ConnectionSetup";
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
  const [connection, setConnection] = useState<ConnectionStatus | null>(null);
  const connected = connection?.connected;
  const [inventory, setInventory] = useState<Inventory | null>(null);
  const [runs, setRuns] = useState<{ templateId: string; values: Run[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    const status = await request<ConnectionStatus>("status");
    setConnection(status);
    if (status.connected) {
      setInventory(await request<Inventory>("automations"));
    } else {
      setInventory(null);
    }
  }
  useEffect(() => {
    void refresh().catch(() => {
      setError("Could not check the saved n8n connection.");
    });
  }, []);
  useEffect(() => {
    if (connection?.phase !== "setting-up") return;
    const timer = window.setInterval(() => {
      void refresh().catch(() => setError("Could not check setup progress. Check status before continuing."));
    }, 2000);
    return () => window.clearInterval(timer);
  }, [connection?.phase]);

  async function act(operation: () => Promise<unknown>, refreshAfter = true) {
    setBusy(true);
    setError(null);
    try {
      await operation();
      if (refreshAfter) await refresh();
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not complete the request");
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function finishSetup(input: { password: string; email?: string; mfaCode?: string }) {
    return act(async () => {
      const instanceId = window.location.pathname.match(/^\/apps\/([^/]+)/)?.[1];
      if (!instanceId) throw new Error("Open this application through ScholarServer to finish installation.");
      const overviewResponse = await fetch("/api/v1/overview");
      if (!overviewResponse.ok) throw new Error("Could not locate this installation. Check status and try again.");
      const overview = await overviewResponse.json();
      const instance = overview.instances.find(
        (candidate: { id: string; packageId: string }) =>
          candidate.id === instanceId && candidate.packageId === "org.scholarserver.n8n"
      );
      if (!instance) throw new Error("This n8n installation is no longer available.");
      const endpoint = `/api/v1/instances/${encodeURIComponent(instance.workspaceId)}/${encodeURIComponent(instanceId)}/actions/setup`;
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json", "x-scholarserver-request": "1" },
        body: JSON.stringify(input)
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.detail ?? "Setup could not be confirmed. Check status before continuing.");
      setConnection(result);
      setTab("automations");
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
      loading={connection === null && !error}
      error={error}
    >
      {connection && !connected ? (
        <ConnectionSetup
          status={connection}
          busy={busy}
          onSetup={finishSetup}
          onRefresh={() => void act(refresh, false)}
        />
      ) : null}
      {connected && tab === "configuration" ? (
        <section className="ss-card ss-stack">
          <h2>n8n is ready</h2>
          <p>ScholarServer is connected. Manage your workflows in Automations; workflow credentials stay in n8n.</p>
          <button className="ss-button" onClick={() => setTab("automations")}>
            View automations
          </button>
          <button className="ss-button ss-button-secondary" disabled={busy} onClick={() => void act(refresh, false)}>
            Check connection
          </button>
        </section>
      ) : null}
      {!connection && error ? (
        <button className="ss-button" disabled={busy} onClick={() => void act(refresh, false)}>
          Check status
        </button>
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
