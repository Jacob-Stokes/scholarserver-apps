// App-owned presentation builders; storage and worker observation stay in the supervisor.
export function vaultsConfiguration(registry) {
  return {
    version: 1,
    id: "vaults",
    revision: String(registry.revision),
    title: "Vaults",
    description: "Add vault connections here. Each vault has separate files, sign-in and sync state.",
    notices: [],
    fields: [
      { id: "label", label: "Vault name", type: "text", required: true, maxLength: 120 },
      {
        id: "source",
        label: "Sync method",
        type: "select",
        required: true,
        options: [
          { value: "official", label: "Obsidian Sync (subscription required)" },
          { value: "livesync", label: "Self-hosted LiveSync" }
        ]
      }
    ],
    values: {},
    summary: registry.vaults.map((vault) => ({
      label: vault.label,
      value: vault.source === "official" ? "Obsidian Sync" : "Self-hosted LiveSync"
    })),
    actions: [
      { id: "add-vault", label: "Add vault", kind: "submit", fieldIds: ["label", "source"], target: { kind: "app" } }
    ]
  };
}

export function selectedVaultConfiguration(
  registry,
  selected,
  revision,
  { childSection = null, workerError = null } = {}
) {
  if (registry.vaults.length === 0)
    return {
      version: 1,
      id: "setup",
      revision: revision,
      title: "Vault connection",
      notices: [{ kind: "info", text: "Add a vault above, then finish its connection here." }],
      fields: [],
      values: {},
      summary: [],
      actions: []
    };
  const section = structuredClone(
    childSection || {
      version: 1,
      id: "setup",
      title: "Vault connection",
      fields: [],
      values: {},
      summary: [],
      actions: [],
      notices: [{ kind: workerError ? "error" : "info", text: workerError || "Starting this vault's sync controller…" }]
    }
  );
  section.revision = revision;
  section.title = "Vault connection";
  section.description = "Configure the selected vault. Other vault connections keep running.";
  section.fields.unshift({
    id: "vaultId",
    label: "Vault connection",
    type: "select",
    required: true,
    selectsContext: true,
    options: registry.vaults.map((vault) => ({ value: vault.id, label: vault.label }))
  });
  section.values.vaultId = selected.id;
  section.actions = section.actions.map((action) => ({
    ...action,
    ...(action.kind === "submit" ? { fieldIds: ["vaultId", ...(action.fieldIds || [])] } : {})
  }));
  section.pollAfterMs = section.pollAfterMs || 3000;
  if (section.outputs)
    section.outputs = section.outputs.map((output) => ({ ...output, id: `${output.id}-${selected.id}` }));
  return section;
}

export function vaultAccessConfiguration(registry, selected, revision) {
  if (registry.vaults.length === 0)
    return {
      version: 1,
      id: "access",
      revision: revision,
      title: "Vault settings",
      fields: [],
      values: {},
      summary: [],
      actions: [],
      notices: [{ kind: "info", text: "Add a vault before choosing its AI access." }]
    };
  return {
    version: 1,
    id: "access",
    revision: revision,
    title: "Vault settings",
    pollAfterMs: 3000,
    description:
      "Names and AI access belong to each vault connection. Sync keeps running when AI access is turned off.",
    notices: [
      {
        kind: "warning",
        text: "AI access exposes the connected vault's selected folder through ScholarServer's tools. It does not change device sync or vault encryption."
      }
    ],
    fields: [
      {
        id: "vaultId",
        label: "Vault connection",
        type: "select",
        selectsContext: true,
        required: true,
        options: registry.vaults.map((vault) => ({ value: vault.id, label: vault.label }))
      },
      { id: "label", label: "Vault name", type: "text", required: true, maxLength: 120 },
      { id: "aiEnabled", label: "Allow AI tools to access this vault", type: "boolean", required: true }
    ],
    values: { vaultId: selected.id, label: selected.label, aiEnabled: selected.aiEnabled },
    summary: [],
    actions: [
      {
        id: "save-access",
        label: "Save vault settings",
        kind: "submit",
        fieldIds: ["vaultId", "label", "aiEnabled"],
        target: { kind: "app" }
      }
    ]
  };
}
