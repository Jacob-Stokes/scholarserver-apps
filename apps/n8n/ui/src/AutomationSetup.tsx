import { useState } from "react";
import { AppRoles } from "./AppRoles";
import type { AppIcons } from "./app-icons";
import type { Template } from "./automation-types";
import { type AutomationSettings, InstallAutomation } from "./InstallAutomation";

export function AutomationSetup({
  template,
  icons,
  busy,
  onInstall,
  initialAutomationId,
  initialRetryOperationId,
  initialName
}: {
  template: Template;
  icons: AppIcons;
  busy: boolean;
  onInstall: (
    templateId: string,
    automationId: string,
    name: string,
    settings: AutomationSettings,
    retryOperationId?: string
  ) => Promise<boolean>;
  initialAutomationId?: string;
  initialRetryOperationId?: string;
  initialName?: string;
}) {
  // Refreshing status retains the draft and the same request identity.
  const [automationId] = useState(() => initialAutomationId ?? crypto.randomUUID());
  const [name, setName] = useState(initialName ?? template.name);
  return (
    <section className="automation-setup-form automation-setup-form-embedded ss-stack">
      <p>{template.description}</p>
      <AppRoles requirements={template.requirements} icons={icons} />
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
        schedule={template.schedule}
        research={template.research}
        requirements={template.requirements}
        expanded
        retry={Boolean(initialRetryOperationId)}
        busy={busy}
        disabledReason={!name.trim() ? "Enter an automation name." : null}
        onInstall={(settings) =>
          void onInstall(template.id, automationId, name.trim(), settings, initialRetryOperationId)
        }
      />
    </section>
  );
}
