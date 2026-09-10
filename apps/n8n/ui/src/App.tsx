import { ApplicationScreen } from "@scholarserver/ui/application-screen";
import { useEffect, useState } from "react";
import { AutomationCatalog } from "./AutomationCatalog";
import type { Application, Inventory, Run } from "./automation-types";
import { ConnectionSetup, type ConnectionStatus } from "./ConnectionSetup";
import { InstallAutomation } from "./InstallAutomation";
import { MyAutomations } from "./MyAutomations";

const base = window.location.pathname.match(/^(.*\/apps\/[^/]+)/)?.[1] ?? "";
const tabs = [
  { id: "automations", label: "My automations" },
  { id: "catalog", label: "Catalog" },
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
  const [runs, setRuns] = useState<{ automationId: string; values: Run[] } | null>(null);
  const [applications, setApplications] = useState<Application[] | null>(null);
  const [icons, setIcons] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    const status = await request<ConnectionStatus>("status");
    setConnection(status);
    if (status.connected) {
      setInventory(await request<Inventory>("automations"));
      try {
        setApplications(await request<Application[]>("research-applications"));
      } catch {
        setApplications(null);
      }
    } else {
      setInventory(null);
    }
  }
  useEffect(() => {
    // Display only packaged same-origin icons, never arbitrary remote image URLs.
    void fetch("/api/v1/overview")
      .then(async (response) => {
        if (!response.ok) return;
        const overview = await response.json();
        const available: Record<string, string> = {};
        for (const app of overview.catalog ?? []) {
          if (typeof app.icon?.url === "string" && app.icon.url.startsWith("/api/v1/catalog/"))
            available[app.id] = app.icon.url;
        }
        setIcons(available);
      })
      .catch(() => undefined);
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
  const diagnostics = inventory?.templates.filter((template) => !template.research) ?? [];

  return (
    <ApplicationScreen
      name="Automations"
      description="Choose a research outcome, connect its apps and review runs."
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
      {!connection && error ? (
        <button className="ss-button" disabled={busy} onClick={() => void act(refresh, false)}>
          Check status
        </button>
      ) : null}
      {connected ? (
        <div className="ss-stack">
          <div className="ss-section-heading">
            <button className="ss-button ss-button-secondary" disabled={busy} onClick={() => void act(refresh, false)}>
              Refresh status
            </button>
          </div>
          {tab === "catalog" && inventory ? (
            <AutomationCatalog
              templates={inventory.templates.filter((template) => template.research)}
              applications={applications}
              icons={icons}
              busy={busy}
              onInstall={async (templateId, automationId, name, settings) => {
                const succeeded = await act(() => request("install", { templateId, automationId, name, settings }));
                if (succeeded) setTab("automations");
                return succeeded;
              }}
            />
          ) : null}
          {tab === "automations" && inventory ? (
            <MyAutomations
              inventory={inventory}
              icons={icons}
              busy={busy}
              runs={runs}
              onCatalog={() => setTab("catalog")}
              onAction={(route, input) => void act(() => request(route, input))}
              onRuns={(automationId) =>
                void act(async () => {
                  const result = await request<{ runs: Run[] }>(
                    `runs?automationId=${encodeURIComponent(automationId)}`
                  );
                  setRuns({ automationId, values: result.runs });
                }, false)
              }
            />
          ) : null}
          {tab === "configuration" ? (
            <section className="ss-card ss-stack">
              <h2>Platform connection</h2>
              <p>Connected to n8n. Credentials and workflow execution remain in n8n.</p>
              <p>Use the n8n application shortcut in ScholarServer to open its editor.</p>
              <details>
                <summary>Execution diagnostic</summary>
                <p>
                  This synthetic workflow checks the engine, not your research app connections. It reads no research
                  data.
                </p>
                {diagnostics.map((template) => {
                  const receipt = Object.values(inventory?.installations ?? {}).find(
                    (value) => value.templateId === template.id
                  );
                  if (receipt)
                    return <p key={template.id}>An execution diagnostic already exists in My automations.</p>;
                  return (
                    <InstallAutomation
                      key={template.id}
                      schedule={template.schedule}
                      retry={false}
                      busy={busy}
                      onInstall={(settings) =>
                        void act(() => request("install", { templateId: template.id, settings }))
                      }
                    />
                  );
                })}
              </details>
            </section>
          ) : null}
        </div>
      ) : null}
    </ApplicationScreen>
  );
}
