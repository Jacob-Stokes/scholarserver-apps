import { createHash } from "node:crypto";

const target = { kind: "app" };
const submit = (id, label, fieldIds = [], extra = {}) => ({ id, label, kind: "submit", fieldIds, target, ...extra });

function revisionFor(status, deviceConnectionUrl) {
  // Health timestamps and errors do not change the saved setup revision.
  const saved = [
    status.profile,
    status.state,
    status.remoteVault,
    status.scopePath,
    status.officialClient?.phase,
    deviceConnectionUrl
  ];
  return createHash("sha256").update(JSON.stringify(saved)).digest("hex");
}

export function obsidianConfiguration(status, { vaults = [], deviceConnectionUrl = null, values = {} } = {}) {
  const section = {
    version: 1,
    id: "setup",
    revision: revisionFor(status, deviceConnectionUrl),
    title: "Vault connection",
    description: "Connect one vault to this installation. Another vault needs a separate installation.",
    stage: { id: "sync-method", label: "Sync method", index: 1, total: 6 },
    pollAfterMs: null,
    notices: [],
    fields: [],
    values: {},
    summary: [],
    actions: []
  };
  const errors = [status.lastError];
  if (status.profile === "livesync") errors.push(status.liveSyncWorker?.lastError);
  if (status.profile === "official") errors.push(status.officialClient?.error);
  for (const error of new Set(errors)) {
    if (typeof error === "string" && error) section.notices.push({ kind: "error", text: error.slice(0, 1000) });
  }
  if (status.state === "recovery-required") {
    section.stage = { id: "recovery", label: "Recovery needed", index: 1, total: 6 };
    section.notices.push({
      kind: "warning",
      text: "Restore the original vault connection and installation choice, then restart this application and check its status. Setup cannot safely be replayed."
    });
    return section;
  }
  if (status.state === "ready") {
    let serverSyncRunning = status.workerRunning === true;
    if (status.profile === "livesync") {
      serverSyncRunning = status.liveSyncWorker?.running === true;
    }
    delete section.stage;
    section.summary = [
      { label: "Sync method", value: status.profile === "livesync" ? "Self-hosted LiveSync" : "Obsidian Sync" },
      { label: "Vault", value: status.remoteVault || "Not reported" },
      { label: "AI-accessible folder", value: status.scopePath || "/" },
      { label: "Server sync", value: serverSyncRunning ? "Running" : "Not confirmed running" }
    ];
    if (status.profile === "livesync")
      section.notices.push({ kind: "warning", text: "Keep other vault sync methods turned off to avoid conflicts." });
    section.actions = [{ id: "check-connection", label: "Check connection", kind: "read", target }];
    return section;
  }
  if (status.profile === "none") {
    section.fields = [
      {
        id: "profile",
        label: "Sync method",
        type: "select",
        required: true,
        options: [
          { value: "livesync", label: "Self-hosted LiveSync" },
          { value: "official", label: "Obsidian Sync (subscription required)" }
        ]
      }
    ];
    section.actions = [submit("select-profile", "Use this sync method", ["profile"])];
    section.notices.push({ kind: "warning", text: "Use only one sync method for this vault." });
    return section;
  }
  if (status.profile === "official") {
    if (status.officialClient?.phase !== "installed") {
      section.stage = { id: "client", label: "Official client", index: 2, total: 6 };
      const phase = status.officialClient?.phase;
      const installing = phase === "downloading" || phase === "verifying";
      if (installing) {
        section.summary.push({
          label: "Download",
          value: phase === "verifying" ? "Verifying download" : "Downloading"
        });
      }
      if (typeof status.officialClient?.approvedVersion === "string") {
        section.summary.push({ label: "Client version", value: status.officialClient.approvedVersion });
      }
      section.instructions = [
        { title: "Obsidian's terms", link: { label: "Read the terms", url: "https://obsidian.md/terms" } }
      ];
      section.fields = [
        {
          id: "confirmed",
          label: "I agree to download the official Obsidian client and accept its terms",
          type: "boolean",
          required: true
        }
      ];
      section.actions = [
        submit("install-client", "Install official client", ["confirmed"], {
          disabled: installing,
          ...(installing ? { reason: "Wait for the current download to finish." } : {})
        })
      ];
      section.notices.push({
        kind: "info",
        text: "Obsidian Sync requires your own subscription. The official client is downloaded after confirmation."
      });
      section.pollAfterMs = 3000;
      return section;
    }
    if (status.state === "vault-selection-required" || status.state === "initial-sync") {
      section.stage = { id: "vault", label: "Choose vault", index: 4, total: 6 };
      section.fields = [
        {
          id: "vault",
          label: "Remote vault",
          type: "select",
          required: true,
          options: vaults
            .map((vault) => ({ value: vault.id ?? vault.vaultId, label: vault.name ?? vault.id ?? vault.vaultId }))
            .filter((option) => typeof option.value === "string" && typeof option.label === "string")
        },
        { id: "encryptionPassword", label: "Vault encryption password, if used", type: "secret", autocomplete: "off" },
        {
          id: "scopePath",
          label: "AI-accessible folder",
          type: "text",
          required: true,
          hint: "Use / for the whole vault, or a folder inside it."
        }
      ];
      section.values = { scopePath: "/" };
      section.actions = [
        submit("connect-vault", "Download and connect vault", ["vault", "encryptionPassword", "scopePath"])
      ];
      return section;
    }
    section.stage = { id: "account", label: "Account", index: 3, total: 6 };
    section.fields = [
      { id: "email", label: "Account email", type: "email", required: true, autocomplete: "username" },
      { id: "password", label: "Password", type: "secret", required: true, autocomplete: "current-password" },
      { id: "mfa", label: "MFA code, if required", type: "secret", autocomplete: "one-time-code" }
    ];
    section.actions = [submit("login", "Connect account", ["email", "password", "mfa"])];
    section.notices.push({
      kind: "info",
      text: "The password and MFA code are used for sign-in and are not returned in status."
    });
    return section;
  }
  if (status.state === "livesync-device-setup") {
    section.stage = { id: "device", label: "Connect first device", index: 5, total: 6 };
    section.fields = [
      {
        id: "repairConnection",
        label: "Change device address",
        type: "boolean",
        hint: "Use this if the setup link has an old address. The existing vault and database are kept."
      }
    ];
    section.values = { repairConnection: false };
    if (deviceConnectionUrl) section.summary = [{ label: "Device address", value: deviceConnectionUrl }];
    if (values.repairConnection === true) {
      section.stage = { id: "device-address", label: "Update device address", index: 5, total: 6 };
      section.endpointIds = ["livesync-couchdb"];
      section.fields.push({
        id: "connectionUrl",
        label: "HTTPS LiveSync address",
        type: "url",
        required: true,
        sourceEndpointId: "livesync-couchdb",
        dependsOn: ["repairConnection"],
        hint: "Use the selected private LiveSync address."
      });
      section.values = { repairConnection: true };
      section.actions = [
        submit("repair-livesync-connection", "Update setup link", ["repairConnection", "connectionUrl"])
      ];
      section.notices.push({
        kind: "info",
        text: "This updates the pending device link. It keeps the vault encryption, database and server copy."
      });
      return section;
    }
    section.outputs = [
      { id: "setup-uri", label: "LiveSync setup URI", sensitive: true, kind: "text" },
      { id: "setup-passphrase", label: "LiveSync setup passphrase", sensitive: true, kind: "text" }
    ];
    section.instructions = [
      {
        title: "Connect Obsidian on your first device",
        text: "Keep this device connected to Tailscale. Install and enable Self-hosted LiveSync in Obsidian, then open the setup URI and enter its one-time passphrase."
      },
      {
        title: "Join the existing server",
        text: "Choose the existing-server option and preserve local data when prompted. Do not create a new server or reset the database. Wait until LiveSync reports that it is up to date."
      }
    ];
    section.fields.unshift({
      id: "confirmedPluginConnected",
      label: "The plugin connected and LiveSync is up to date",
      type: "boolean",
      required: true,
      dependsOn: ["repairConnection"]
    });
    section.actions = [submit("complete-livesync", "Connect server copy", ["confirmedPluginConnected"])];
    section.notices.push({
      kind: "warning",
      text: "Keep Obsidian Sync, iCloud, Git sync and other vault sync tools turned off."
    });
    return section;
  }
  if (status.state === "livesync-preparing" || status.state === "livesync-server-joining") {
    section.stage = { id: "joining", label: "Preparing server copy", index: 5, total: 6 };
    section.pollAfterMs = 3000;
    section.notices.push({
      kind: "info",
      text: "ScholarServer is preparing or joining the vault. Check this stage before taking another action."
    });
    return section;
  }
  section.stage = { id: "livesync", label: "LiveSync connection", index: 2, total: 6 };
  section.endpointIds = ["livesync-couchdb"];
  section.fields = [
    {
      id: "accessMethod",
      label: "Device access",
      type: "select",
      required: true,
      options: [{ value: "tailscale", label: "Private Tailscale" }]
    },
    {
      id: "connectionUrl",
      label: "HTTPS LiveSync address",
      type: "url",
      required: true,
      sourceEndpointId: "livesync-couchdb",
      hint: "Prepare the LiveSync endpoint in Access. Its selected address appears here when ready."
    },
    {
      id: "vaultPassphrase",
      label: "Vault encryption passphrase",
      type: "secret",
      required: true,
      minLength: 12,
      autocomplete: "new-password"
    },
    {
      id: "vaultPassphraseAgain",
      label: "Confirm vault passphrase",
      type: "secret",
      required: true,
      confirmField: "vaultPassphrase",
      autocomplete: "new-password"
    },
    {
      id: "scopePath",
      label: "AI-accessible folder",
      type: "text",
      required: true,
      hint: "Use / for the whole vault, or a folder inside it."
    },
    { id: "confirmedNoOtherSync", label: "Other vault sync methods are turned off", type: "boolean", required: true }
  ];
  section.values = { accessMethod: "tailscale", scopePath: "/", confirmedNoOtherSync: false };
  section.actions = [
    submit(
      "configure-livesync",
      "Prepare LiveSync",
      section.fields.map((field) => field.id),
      {
        confirmation: {
          title: "Prepare this vault",
          text: "ScholarServer will create a new LiveSync database and bind this installation to it. This cannot replace an existing vault."
        }
      }
    )
  ];
  section.notices.push({ kind: "warning", text: "Other sync methods must be off before connecting this vault." });
  return section;
}

export function validateObsidianConfigurationAction(actionId, values) {
  if (actionId === "configure-livesync" && values.vaultPassphrase !== values.vaultPassphraseAgain)
    throw new Error("Vault passphrases do not match.");
  if (actionId === "configure-livesync" && values.confirmedNoOtherSync !== true)
    throw new Error("Confirm that other vault sync methods are turned off.");
  if (["configure-livesync", "repair-livesync-connection"].includes(actionId)) {
    let address;
    try {
      address = new URL(values.connectionUrl);
    } catch {
      throw new Error("Choose the prepared HTTPS LiveSync address.");
    }
    if (
      (actionId === "configure-livesync" && values.accessMethod !== "tailscale") ||
      address.protocol !== "https:" ||
      !address.hostname.endsWith(".ts.net") ||
      address.pathname !== "/" ||
      address.username ||
      address.password ||
      address.search ||
      address.hash
    ) {
      throw new Error("Choose the prepared private Tailscale LiveSync address.");
    }
    if (actionId === "repair-livesync-connection" && values.repairConnection !== true)
      throw new Error("Choose to change the device address before updating the setup link.");
  }
  if (
    ["configure-livesync", "connect-vault"].includes(actionId) &&
    (values.scopePath.includes("..") || values.scopePath.includes("\\") || values.scopePath.startsWith("~"))
  ) {
    throw new Error("Choose a folder inside the vault.");
  }
  if (["install-client", "complete-livesync"].includes(actionId)) {
    const key = actionId === "install-client" ? "confirmed" : "confirmedPluginConnected";
    if (values[key] !== true) throw new Error("Confirm this step before continuing.");
  }
}

export async function attachCurrentSectionWhenAvailable(receipt, readSection) {
  if (receipt.status !== "succeeded") return receipt;
  try {
    return { ...receipt, section: await readSection() };
  } catch {
    // A presentation refresh cannot undo or reclassify a confirmed operation.
    return receipt;
  }
}
