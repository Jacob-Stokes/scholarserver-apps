import { ApplicationScreen } from "@scholarserver/ui/application-screen";
import { EmbeddedSetupSurface } from "@scholarserver/ui/embedded-setup";
import { SectionFeedback } from "@scholarserver/ui/section-feedback";
import { useReadResource } from "@scholarserver/ui/use-read-resource";
import { useEffect, useState } from "react";
import { AutomationSetup } from "./AutomationSetup";
import { ConnectionSetup, type ConnectionStatus } from "./ConnectionSetup";
import { parseEmbeddedSetup, resolveEmbeddedSetup } from "./embedded-setup";
import { createN8nReads } from "./n8n-reads";
import { N8nReadContext, useN8nReads } from "./read-context";

const base = window.location.pathname.match(/^(.*\/apps\/[^/]+)/)?.[1] ?? "";
export function App() {
  const [session, setSession] = useState(0);
  const embeddedSetup = parseEmbeddedSetup(window.location.search);
  const route = window.location.pathname.replace(base, "").replace(/\/$/, "");
  if (route !== "/automation-setup" || !embeddedSetup.enabled) {
    return (
      <ApplicationScreen
        name="Automations"
        description="Choose and manage your automations in Manager."
        tabs={[]}
        currentTab="manager"
        onNavigate={() => window.location.assign("/automations")}
      >
        <a className="ss-button" href="/automations">
          Open Automations
        </a>
      </ApplicationScreen>
    );
  }
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
  const iconsRead = useReadResource(reads.icons);
  const inventory = inventoryRead.data ?? null;
  const icons = iconsRead.data ?? {};
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
    });
  }
  if (connectionRead.blocked) return <EmbeddedSetupSurface>{connectionFeedback}</EmbeddedSetupSurface>;

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
        <AutomationSetup
          key={`${template.id}:${embeddedSetup.automationId ?? "new"}:${receipt?.operationId ?? ""}`}
          template={template}
          icons={icons}
          busy={busy}
          initialAutomationId={embeddedSetup.automationId ?? undefined}
          initialRetryOperationId={receipt?.operationId}
          initialName={receipt?.name}
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
