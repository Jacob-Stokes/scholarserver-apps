import { useState } from "react";
import { AppRoles } from "./AppRoles";
import { type Application, availableForRole, type Template } from "./automation-types";
import { InstallAutomation } from "./InstallAutomation";
import type { ResearchBindings } from "./ResearchSettings";

export function AutomationCatalog({
  templates,
  applications,
  icons,
  busy,
  onInstall
}: {
  templates: Template[];
  applications: Application[] | null;
  icons: Record<string, string>;
  busy: boolean;
  onInstall: (
    templateId: string,
    automationId: string,
    name: string,
    settings: { hoursInterval?: number; research?: ResearchBindings }
  ) => Promise<boolean>;
}) {
  const [selected, setSelected] = useState<{ template: Template; id: string } | null>(null);
  const [name, setName] = useState("");
  if (selected) {
    return (
      <section className="ss-card ss-stack">
        <button className="ss-button ss-button-secondary" disabled={busy} onClick={() => setSelected(null)}>
          Back to catalog
        </button>
        <h2>{selected.template.name}</h2>
        <p>{selected.template.description}</p>
        <AppRoles requirements={selected.template.requirements} icons={icons} />
        <label>
          Automation name
          <input
            className="ss-input"
            value={name}
            maxLength={120}
            required
            disabled={busy}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <InstallAutomation
          schedule={selected.template.schedule}
          research={selected.template.research}
          requirements={selected.template.requirements}
          expanded
          retry={false}
          busy={busy || !name.trim()}
          onInstall={(settings) => void onInstall(selected.template.id, selected.id, name.trim(), settings)}
        />
      </section>
    );
  }
  return (
    <div className="automation-catalog">
      {templates.map((template) => {
        const requirements = template.requirements ?? [];
        const unavailable =
          applications === null
            ? []
            : requirements.filter(
                (requirement) => !applications.some((application) => availableForRole(application, requirement))
              );
        const workspaces = new Set(applications?.map((application) => application.workspaceId));
        const compatibleWorkspace = [...workspaces].some((workspace) =>
          requirements.every((requirement) =>
            applications?.some(
              (application) => application.workspaceId === workspace && availableForRole(application, requirement)
            )
          )
        );
        let readiness = "Check app availability during setup.";
        if (applications !== null) {
          if (unavailable.length)
            readiness = `Not available to this platform: ${unavailable.map((requirement) => requirement.name).join(", ")}.`;
          else if (!compatibleWorkspace) readiness = "The required apps must be available in the same workspace.";
          else readiness = "Required app actions available · Choose connections and a folder.";
        }
        return (
          <section className="ss-card ss-stack" key={template.id}>
            <small>Preview · n8n</small>
            <h2>{template.name}</h2>
            <AppRoles requirements={requirements} icons={icons} />
            <p>{template.presentation?.summary ?? template.description}</p>
            <p>{readiness}</p>
            {unavailable.length ? (
              <p>
                Install, start or update the app, or review its granted actions. This connection cannot distinguish all
                of those causes.
              </p>
            ) : null}
            <p>
              {template.presentation?.effects} {template.presentation?.ai === "none" ? "No AI service." : ""}
            </p>
            <button
              className="ss-button"
              disabled={busy}
              onClick={() => {
                setSelected({ template, id: crypto.randomUUID() });
                setName(template.name);
              }}
            >
              Set up
            </button>
          </section>
        );
      })}
    </div>
  );
}
