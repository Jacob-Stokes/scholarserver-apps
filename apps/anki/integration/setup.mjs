export const setupOptions = [
  {
    id: "sync-only",
    name: "Self-hosted sync only",
    desktop: false,
    sync: true,
    description: "Sync Anki on your own devices. No browser study or AI card tools."
  },
  {
    id: "ankiweb-desktop",
    name: "Browser desktop with AnkiWeb",
    desktop: true,
    sync: false,
    description: "Study in your browser and connect AI tools. Sign in to your existing AnkiWeb account inside Anki."
  },
  {
    id: "self-hosted-desktop",
    name: "Browser desktop with self-hosted sync",
    desktop: true,
    sync: true,
    description:
      "Keep a sync server and a separate desktop copy on your server. Configure each device with the same server address."
  }
];

export function setupPlan(id) {
  const option = setupOptions.find((candidate) => candidate.id === id);
  if (!option) throw new Error("Choose an available setup option.");
  const services = ["controller"];
  const data = ["runtime"];
  if (option.desktop) {
    services.push("desktop", "mcp");
    data.push("desktop", "operations");
  }
  if (option.sync) {
    services.push("sync");
    data.push("sync", "sync-credentials");
  }
  return { ...option, services, data };
}

// Pure save decision, suitable for a future onboarding handler. The preview
// persists only this non-secret draft. Installed service changes belong to core.
export function validateSetupDraft(value, installedOption = null) {
  if (!value || typeof value !== "object" || Object.keys(value).some((key) => key !== "option")) {
    throw new Error("Only a setup option may be saved here.");
  }
  setupPlan(value.option);
  if (installedOption && installedOption !== value.option) {
    throw new Error("Changing an installed setup needs a separate migration review. Existing data is preserved.");
  }
  return { option: value.option };
}
