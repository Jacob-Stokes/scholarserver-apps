import { AppRoles } from "./AppRoles";
import type { Inventory, Run } from "./automation-types";
import { InstallAutomation } from "./InstallAutomation";

export function MyAutomations({
  inventory,
  icons,
  busy,
  runs,
  onAction,
  onRuns,
  onCatalog
}: {
  inventory: Inventory;
  icons: Record<string, string>;
  busy: boolean;
  runs: { automationId: string; values: Run[] } | null;
  onAction: (route: string, body: unknown) => void;
  onRuns: (automationId: string) => void;
  onCatalog: () => void;
}) {
  const managedIds = new Set(Object.values(inventory.installations).map((receipt) => receipt.workflowId));
  const discovered = inventory.workflows.filter((workflow) => !managedIds.has(workflow.id));
  return (
    <div className="ss-stack">
      {!Object.keys(inventory.installations).length ? (
        <section className="ss-card ss-stack">
          <h2>No guided automations yet</h2>
          <p>Choose an outcome, connect its apps and review the workflow before enabling it.</p>
          <button className="ss-button" onClick={onCatalog}>
            Browse automation catalog
          </button>
        </section>
      ) : null}
      {Object.entries(inventory.installations).map(([automationId, receipt]) => {
        const template = inventory.templates.find((candidate) => candidate.id === receipt.templateId);
        const workflow = inventory.workflows.find((candidate) => candidate.id === receipt.workflowId);
        const disconnected = Boolean(template?.research && receipt.researchAccess !== "ready");
        const customised = receipt.editing === "customised";
        const canEnable = receipt.editing === "guided" && !disconnected;
        let status = "Status unavailable";
        if (workflow) status = workflow.active ? "Schedule enabled" : "Schedule disabled";
        return (
          <section className="ss-card ss-stack" key={automationId}>
            <h2>{receipt.name ?? template?.name ?? "Saved automation"}</h2>
            {template ? <AppRoles requirements={template.requirements ?? []} icons={icons} /> : null}
            {receipt.bindings ? (
              <p className="automation-bindings">
                Workspace: {receipt.bindings.workspaceId} · Library: {receipt.bindings.zotero} · Destination:{" "}
                {receipt.bindings.obsidian ?? receipt.bindings.docling} · Folder: {receipt.bindings.folder}
              </p>
            ) : null}
            {receipt.state === "installed" ? (
              <>
                <p>
                  {status}
                  {customised ? " · Customised in n8n" : ""}
                </p>
                {customised ? (
                  <p>
                    The workflow differs from its installed version. Its original app roles are shown above, but may no
                    longer describe every step. Review and enable it in n8n; ScholarServer will not overwrite it.
                  </p>
                ) : null}
                {receipt.editing === "unknown" ? (
                  <p role="alert">Could not inspect this workflow. Refresh status before enabling it.</p>
                ) : null}
                {typeof workflow?.minutesInterval === "number" ? (
                  <p>
                    Checks every {workflow.minutesInterval} {workflow.minutesInterval === 1 ? "minute" : "minutes"} when
                    enabled.
                  </p>
                ) : null}
                {typeof workflow?.hoursInterval === "number" ? (
                  <p>Every {workflow.hoursInterval} hours when enabled.</p>
                ) : null}
                <div className="automation-actions">
                  <button
                    className="ss-button"
                    disabled={busy || !workflow || (!workflow.active && !canEnable)}
                    onClick={() => onAction("enabled", { automationId, enabled: !workflow?.active })}
                  >
                    {workflow?.active ? "Disable schedule" : "Enable schedule"}
                  </button>
                  <button
                    className="ss-button ss-button-secondary"
                    disabled={busy || !workflow}
                    onClick={() => onRuns(automationId)}
                  >
                    Show recent runs
                  </button>
                </div>
                <p>
                  Disabling stops future scheduled triggers. It does not undo output or cancel work already running.
                </p>
                {!workflow ? (
                  <p role="alert">
                    The workflow is not in the complete current inventory. Check n8n before making changes; it has not
                    been recreated.
                  </p>
                ) : null}
              </>
            ) : null}
            {receipt.state === "rejected" && template ? (
              <InstallAutomation
                schedule={template.schedule}
                research={template.research}
                requirements={template.requirements}
                retry
                busy={busy}
                onInstall={(settings) =>
                  onAction("install", {
                    templateId: receipt.templateId,
                    automationId,
                    settings,
                    name: receipt.name,
                    retryOperationId: receipt.operationId
                  })
                }
              />
            ) : null}
            {receipt.state !== "installed" && receipt.state !== "rejected" ? (
              <>
                <p role="status">
                  Installation is {receipt.state}. Check the existing request before adding another copy.
                </p>
                <button className="ss-button" disabled={busy} onClick={() => onAction("reconcile", { automationId })}>
                  Check installation
                </button>
              </>
            ) : null}
            {template?.research ? (
              <details>
                <summary>Research access</summary>
                <p>
                  Disconnecting blocks future research requests, including manual runs. It does not delete the workflow
                  or its output. Reconnection requires administrator review.
                </p>
                {disconnected ? <p role="status">Research access: {receipt.researchAccess ?? "unavailable"}.</p> : null}
                <button
                  className="ss-button ss-button-secondary"
                  disabled={busy || disconnected}
                  onClick={() => onAction("revoke-research", { automationId })}
                >
                  Disconnect research access
                </button>
              </details>
            ) : null}
            {runs?.automationId === automationId ? (
              <ul>
                {runs.values.length ? (
                  runs.values.map((run) => (
                    <li key={run.id}>
                      {run.status} · {new Date(run.startedAt).toLocaleString()}
                    </li>
                  ))
                ) : (
                  <li>No recorded runs. This does not prove that the workflow has never run.</li>
                )}
              </ul>
            ) : null}
          </section>
        );
      })}
      {discovered.length ? (
        <section className="ss-card ss-stack">
          <h2>Created in n8n</h2>
          <p>
            These workflows are not managed from a ScholarServer template. App requirements and data destinations have
            not been inspected. Open n8n to edit them.
          </p>
          <ul>
            {discovered.map((workflow) => (
              <li key={workflow.id}>
                {workflow.name} — {workflow.active ? "Schedule enabled" : "Inactive"}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
