const target = { kind: "app" };

function navigation(options) {
  return {
    id: "vaultId",
    label: "Vault navigation",
    type: "select",
    required: true,
    selectsContext: true,
    presentation: "navigation",
    options
  };
}
const back = { value: "overview", label: "Back to vaults", actionLabel: "Back to vaults" };
const methods = {
  "add-official": {
    source: "official",
    label: "Obsidian Sync",
    description: "Sign in to your Obsidian account, then choose a remote vault. A subscription is required."
  },
  "add-livesync-existing": {
    source: "livesync",
    setupMode: "join",
    label: "Existing LiveSync vault",
    description: "Connect using the setup URI from a vault already using Self-hosted LiveSync."
  },
  "add-livesync-new": {
    source: "livesync",
    setupMode: "new",
    label: "New LiveSync setup",
    description: "Create a database on ScholarServer, then connect your Obsidian devices."
  }
};
export function additionMethod(view) {
  return methods[view] || null;
}

export function connectionStatus(vault, status, workerError) {
  if (workerError || status?.lastError || status?.liveSyncWorker?.lastError) return "Needs attention";
  if (status?.state === "recovery-required") return "Recovery needed";
  if (status?.state === "ready") {
    const running = vault.source === "official" ? status.workerRunning : status.liveSyncWorker?.running;
    return running ? "Running" : "Sync not confirmed";
  }
  if (["initial-sync", "livesync-preparing", "livesync-server-joining"].includes(status?.state)) return "Connecting…";
  return "Finish setup";
}

export function vaultWorkspaceConfiguration(
  registry,
  revision,
  view = "overview",
  { childSection, statuses = {}, errors = {} } = {}
) {
  const section = {
    version: 1,
    id: "vaults",
    revision,
    title: "Vaults",
    pollAfterMs: 3000,
    notices: [],
    fields: [],
    values: { vaultId: view },
    summary: [],
    actions: []
  };
  if (view === "overview") {
    section.fields = [
      navigation([
        { value: view, label: "Vaults" },
        ...registry.vaults.map((vault) => ({
          value: vault.id,
          label: vault.label,
          description: vault.source === "official" ? "Obsidian Sync" : "Self-hosted LiveSync",
          status: connectionStatus(vault, statuses[vault.id], errors[vault.id]),
          actionLabel: statuses[vault.id]?.state === "ready" ? "Manage" : "Continue setup"
        })),
        { value: "add", label: "Add vault", actionLabel: "Add vault", presentation: "action" }
      ])
    ];
    section.fields[0].presentation = "cards";
    if (!registry.vaults.length) section.description = "Connect an Obsidian vault to get started.";
    return section;
  }
  section.presentation = { kind: "dialog", dismissValue: "overview" };
  if (view === "add") {
    section.title = "Add vault";
    section.description = "Choose where your vault syncs.";
    section.fields = [
      navigation([
        back,
        { value: view, label: "Add vault" },
        ...Object.entries(methods).map(([value, method]) => ({
          value,
          label: method.label,
          description: method.description,
          actionLabel: "Choose"
        }))
      ])
    ];
    return section;
  }
  const method = additionMethod(view);
  if (method) {
    section.title = method.label;
    section.description = method.description;
    section.fields = [
      navigation([
        back,
        { value: "add", label: "Change sync choice", actionLabel: "Change sync choice" },
        { value: view, label: method.label }
      ]),
      {
        id: "label",
        label: "Name in ScholarServer (optional)",
        type: "text",
        maxLength: 120,
        hint: "A label for this connection. You choose or connect the actual vault in the next steps."
      }
    ];
    section.actions = [{ id: "add-vault", label: "Continue", kind: "submit", fieldIds: ["vaultId", "label"], target }];
    return section;
  }
  const selected = registry.vaults.find((vault) => vault.id === view);
  if (!selected) throw new Error("Choose an existing vault connection.");
  const child = structuredClone(childSection || { fields: [], values: {}, summary: [], actions: [], notices: [] });
  Object.assign(section, child, {
    id: "vaults",
    revision,
    title: selected.label,
    description: selected.source === "official" ? "Obsidian Sync" : "Self-hosted LiveSync",
    pollAfterMs: child.pollAfterMs || 3000,
    presentation: { kind: "dialog", dismissValue: "overview" }
  });
  if (section.summary.some((item) => item.label === "Server sync")) {
    const editableSummaryLabels = new Set(["Sync method", "AI-accessible folder"]);
    section.summary = section.summary
      .filter((item) => !editableSummaryLabels.has(item.label))
      .map((item) => (item.label === "Vault" ? { ...item, label: "Remote vault" } : item));
  }
  section.fields = [
    navigation([back, { value: view, label: selected.label }]),
    ...child.fields,
    { id: "label", label: "Name in ScholarServer", type: "text", required: true, maxLength: 120 },
    { id: "aiEnabled", label: "Allow AI tools to access this vault", type: "boolean", required: true }
  ];
  section.values = { ...child.values, vaultId: selected.id, label: selected.label, aiEnabled: selected.aiEnabled };
  section.actions = child.actions.map((action) => ({
    ...action,
    ...(action.kind === "submit" ? { fieldIds: ["vaultId", ...(action.fieldIds || [])] } : {})
  }));
  section.actions.push({
    id: "save-access",
    label: "Save name and AI access",
    kind: "submit",
    fieldIds: ["vaultId", "label", "aiEnabled"],
    target
  });
  section.notices.push({
    kind: "warning",
    text: "AI tools can access this vault's selected folder when enabled. This does not change device sync or encryption."
  });
  if (errors[selected.id]) section.notices.push({ kind: "error", text: errors[selected.id] });
  if (section.outputs)
    section.outputs = section.outputs.map((output) => ({ ...output, id: `${output.id}-${selected.id}` }));
  return section;
}
