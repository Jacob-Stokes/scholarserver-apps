import { useState } from "react";
import { AppRoles } from "./AppRoles";
import { type Application, type Template } from "./automation-types";
import { CatalogToolbar } from "./CatalogToolbar";
import { emptyCatalogFilters, filterTemplates, requiredAppAccess } from "./catalog-discovery";
import { type AutomationSettings, InstallAutomation } from "./InstallAutomation";

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
  onInstall: (templateId: string, automationId: string, name: string, settings: AutomationSettings) => Promise<boolean>;
}) {
  const [selected, setSelected] = useState<{ template: Template; id: string } | null>(null);
  const [name, setName] = useState("");
  const [filters, setFilters] = useState(emptyCatalogFilters);
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
  const visibleTemplates = filterTemplates(templates, filters);
  return (
    <div className="ss-stack">
      <CatalogToolbar templates={templates} filters={filters} count={visibleTemplates.length} onChange={setFilters} />
      {!visibleTemplates.length ? (
        <section className="ss-card">
          <h2>{templates.length ? "No matching automations" : "No automation templates available"}</h2>
          <p>
            {templates.length
              ? "Change your search or clear the filters to see more automations."
              : "Refresh status to check the templates supplied by this application package."}
          </p>
        </section>
      ) : null}
      <div className="automation-catalog">
        {visibleTemplates.map((template) => {
          const requirements = template.requirements ?? [];
          const access = requiredAppAccess(template, applications);
          return (
            <section className="ss-card automation-template" key={template.id}>
              <small className="catalog-maturity">Preview · n8n</small>
              <AppRoles requirements={requirements} icons={icons} compact />
              <h2>{template.name}</h2>
              <p>{template.presentation?.summary ?? template.description}</p>
              <div className="catalog-tags" aria-label="Tags">
                {(template.presentation?.tags ?? []).map((tag) => (
                  <span className="catalog-tag" key={tag}>
                    {tag}
                  </span>
                ))}
              </div>
              <p className="catalog-effects">
                {template.presentation?.effects} {template.presentation?.ai === "none" ? "No AI service." : ""}
              </p>
              {!access.available ? (
                <div className="catalog-access-warning">
                  <p>{access.message}</p>
                  <details>
                    <summary>About app availability</summary>
                    <p>
                      Install, start or update the app, or review its granted actions. This connection cannot
                      distinguish all of those causes. Availability does not verify your selected library or folder.
                    </p>
                  </details>
                </div>
              ) : null}
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
    </div>
  );
}
