import { ApplicationScreen } from "@scholarserver/ui/application-screen";
import { EmbeddedSetupSurface } from "@scholarserver/ui/embedded-setup";
import { SectionFeedback } from "@scholarserver/ui/section-feedback";
import { useReadResource } from "@scholarserver/ui/use-read-resource";
import { useEffect, useState } from "react";
import { AutomationCatalog } from "./AutomationCatalog";
import { ConnectionSetup, type ConnectionStatus } from "./ConnectionSetup";
import { parseEmbeddedSetup, resolveEmbeddedSetup } from "./embedded-setup";
import { InstallAutomation } from "./InstallAutomation";
import { MyAutomations } from "./MyAutomations";
import { createN8nReads } from "./n8n-reads";
import { N8nReadContext, useN8nReads } from "./read-context";

const base = window.location.pathname.match(/^(.*\/apps\/[^/]+)/)?.[1] ?? "";
const tabs = [
  { id: "automations", label: "My automations" },
  { id: "catalog", label: "Catalog" },
  { id: "configuration", label: "Configuration" }
];

export function App() {
  const [session, setSession] = useState(0);
  return <N8nSession key={session} onAccessRetry={() => setSession((value) => value + 1)} />;
}
function N8nSession({ onAccessRetry }: { onAccessRetry: () => void }) {
  const [reads] = useState(() => createN8nReads(base));
  return (
    <N8nReadContext.Provider value={reads}>
      <N8nScreen onAccessRetry={onAccessRetry} />
    </N8nReadContext.Provider>
  );
}
function N8nScreen({ onAccessRetry }: { onAccessRetry: () => void }) {
  const reads = useN8nReads();
  const { request } = reads;
  const embeddedSetup = parseEmbeddedSetup(window.location.search);
  const [tab, setTab] = useState("automations");
  const [runsId, setRunsId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [embeddedCompleted, setEmbeddedCompleted] = useState(false);

  const connectionRead = useReadResource(
    reads.status,
    (status) => (status?.phase === "setting-up" ? 2000 : 30000),
    !busy
  );
  const connection = connectionRead.data ?? null;
  const connected = connection?.connected === true;
  const inventoryRead = useReadResource(reads.inventory, 30000, connected && !busy);
  const applicationsRead = useReadResource(reads.applications, 30000, connected && !busy);
  const iconsRead = useReadResource(reads.icons);
  const runsResource = reads.runs(runsId ?? "");
  const runsRead = useReadResource(runsResource, 10000, connected && !!runsId && tab === "automations");
  const inventory = inventoryRead.data ?? null;
  const applications = applicationsRead.data ?? null;
  const icons = iconsRead.data ?? {};
  const runs = runsId
    ? {
        automationId: runsId,
        values: runsRead.data,
        pending: runsRead.pending,
        error: runsRead.error,
        retry: () => void runsResource.refresh(true)
      }
    : null;
  async function refresh() {
    reads.status.invalidate();
    await reads.status.refresh();
    if (reads.status.getSnapshot().data?.connected) {
      await Promise.all([reads.inventory.refresh(true), reads.applications.refresh(true)]);
    }
  }
  useEffect(() => {
    if (!connection || connected) return;
    reads.inventory.invalidate(true);
    reads.applications.invalidate(true);
    setRunsId(null);
  }, [connection?.connected, reads]);
  const connectionFeedback = (
    <SectionFeedback
      pending={connectionRead.pending}
      hasData={!!connection}
      label="n8n status"
      error={connectionRead.error}
      onRetry={connectionRead.blocked ? onAccessRetry : () => void refresh()}
    />
  );
  const inventoryFeedback = (
    <SectionFeedback
      pending={inventoryRead.pending}
      hasData={!!inventory}
      label="automations"
      error={inventoryRead.error}
      onRetry={() => void reads.inventory.refresh(true)}
    />
  );
  const applicationsFeedback = (
    <SectionFeedback
      pending={applicationsRead.pending}
      hasData={!!applications}
      label="research applications"
      error={applicationsRead.error}
      onRetry={() => void reads.applications.refresh(true)}
    />
  );

  async function act(operation: () => Promise<unknown>, refreshAfter = true) {
    reads.status.cancel();
    reads.inventory.cancel();
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
      const overview = await reads.json<{ instances: Array<{ id: string; packageId: string; workspaceId: string }> }>(
        "/api/v1/overview"
      );
      const instance = overview.instances.find(
        (candidate: { id: string; packageId: string }) =>
          candidate.id === instanceId && candidate.packageId === "org.scholarserver.n8n"
      );
      if (!instance) throw new Error("This n8n installation is no longer available.");
      const endpoint = `/api/v1/instances/${encodeURIComponent(instance.workspaceId)}/${encodeURIComponent(instanceId)}/actions/setup`;
      const result = await reads.json<ConnectionStatus>(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json", "x-scholarserver-request": "1" },
        body: JSON.stringify(input)
      });
      reads.status.seed(result);
      setTab("automations");
    });
  }
  if (connectionRead.blocked) {
    if (embeddedSetup.enabled) return <EmbeddedSetupSurface>{connectionFeedback}</EmbeddedSetupSurface>;
    return (
      <ApplicationScreen
        name="Automations"
        description="Reconnect to continue."
        tabs={tabs}
        currentTab={tab}
        onNavigate={setTab}
        feedback={connectionFeedback}
      >
        {null}
      </ApplicationScreen>
    );
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
        {connectionFeedback}
        {connected ? inventoryFeedback : null}
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
      feedback={connectionFeedback}
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
          {tab !== "configuration" ? inventoryFeedback : null}
          {tab === "catalog" && inventory ? (
            <AutomationCatalog
              templates={inventory.templates.filter((template) => template.research)}
              applications={applications}
              discoveryFeedback={applicationsFeedback}
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
              onRuns={(automationId) => {
                setRunsId(automationId);
                void reads.runs(automationId).refresh(true);
              }}
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
