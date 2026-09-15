import { ApplicationScreen } from "@scholarserver/ui/application-screen";
import { EmbeddedSetupSurface } from "@scholarserver/ui/embedded-setup";
import { useEffect, useState } from "react";
import { AutomationCatalog } from "./AutomationCatalog";
import { type AppIcons, catalogAppIcons } from "./app-icons";
import type { Application, Inventory, Run } from "./automation-types";
import { ConnectionSetup, type ConnectionStatus } from "./ConnectionSetup";
import { parseEmbeddedSetup, resolveEmbeddedSetup } from "./embedded-setup";
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
  const embeddedSetup = parseEmbeddedSetup(window.location.search);
  const [tab, setTab] = useState("automations");
  const [connection, setConnection] = useState<ConnectionStatus | null>(null);
  const connected = connection?.connected;
  const [inventory, setInventory] = useState<Inventory | null>(null);
  const [runs, setRuns] = useState<{ automationId: string; values: Run[] } | null>(null);
  const [applications, setApplications] = useState<Application[] | null>(null);
  const [icons, setIcons] = useState<AppIcons>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [embeddedCompleted, setEmbeddedCompleted] = useState(false);

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
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 5000);
    // Browser-session metadata only; no service identity and no effect on setup readiness.
    void fetch("/api/v1/catalog", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) return;
        const catalog = await response.json();
        if (!controller.signal.aborted) setIcons(catalogAppIcons(catalog?.applications));
      })
      .catch(() => undefined)
      .finally(() => window.clearTimeout(timeout));
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, []);
  useEffect(() => {
    void refresh().catch(() => {
      setError("Could not check the saved n8n connection.");
    });
  }, [embeddedSetup.enabled]);
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

  if (embeddedSetup.enabled) {
    const resolution = inventory
      ? resolveEmbeddedSetup(embeddedSetup, inventory.templates, inventory.installations)
      : null;
    const template = resolution?.kind === "new" || resolution?.kind === "retry" ? resolution.template : null;
    const receipt = resolution?.kind === "retry" ? resolution.receipt : undefined;
    const setupError =
      resolution?.kind === "invalid" ? `${resolution.message} Refresh Manager and open setup again.` : null;
    if (embeddedCompleted) {
      return (
        <EmbeddedSetupSurface>
          <section className="ss-card ss-stack">
            <h1>Automation added</h1>
            <p>Your automation starts paused. Turn on automatic runs from Manage when you&apos;re ready.</p>
            <p>Close this window to return to Automations.</p>
          </section>
        </EmbeddedSetupSurface>
      );
    }
    return (
      <EmbeddedSetupSurface>
        {error ? <p role="alert">{error}</p> : null}
        {connection && !connected ? (
          <ConnectionSetup
            status={connection}
            busy={busy}
            onSetup={finishSetup}
            onRefresh={() => void act(refresh, false)}
          />
        ) : null}
        {!connection && !error ? <p role="status">Checking n8n status…</p> : null}
        {!connection && error ? (
          <button className="ss-button" disabled={busy} onClick={() => void act(refresh, false)}>
            Refresh status
          </button>
        ) : null}
        {connected && setupError ? (
          <section className="ss-card ss-stack">
            <h1>Automation setup needs attention</h1>
            <p>{setupError}</p>
            {receipt ? <p>Existing automation status: {receipt.state}.</p> : null}
            <button className="ss-button" disabled={busy} onClick={() => void act(refresh, false)}>
              Refresh status
            </button>
          </section>
        ) : null}
        {connected && resolution?.kind === "engine" ? (
          <section className="ss-card ss-stack">
            <h1>n8n is ready</h1>
            <p>Your n8n connection is ready. Return to Automations to choose an automation.</p>
          </section>
        ) : null}
        {connected && inventory && template && !setupError ? (
          <AutomationCatalog
            templates={[template]}
            applications={applications}
            icons={icons}
            busy={busy}
            initialTemplateId={template.id}
            initialAutomationId={embeddedSetup.automationId ?? undefined}
            initialRetryOperationId={receipt?.operationId}
            initialName={receipt?.name}
            embedded
            onInstall={async (templateId, automationId, name, settings, retryOperationId) => {
              const succeeded = await act(async () => {
                const result = await request<{ state: string }>("install", {
                  templateId,
                  automationId,
                  name,
                  settings,
                  ...(retryOperationId ? { retryOperationId } : {})
                });
                if (result.state === "installed") setEmbeddedCompleted(true);
              });
              return succeeded;
            }}
          />
        ) : null}
      </EmbeddedSetupSurface>
    );
  }

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
              onInstall={async (templateId, automationId, name, settings, retryOperationId) => {
                const succeeded = await act(() =>
                  request("install", { templateId, automationId, name, settings, retryOperationId })
                );
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
