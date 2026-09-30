import { obsidianConfiguration } from "./configuration.mjs";
import { selectedVaultConfiguration, vaultAccessConfiguration, vaultsConfiguration } from "./vault-configuration.mjs";

function status(profile, state, extra = {}) {
  return {
    profile,
    state,
    remoteVault: null,
    scopePath: "/",
    lastError: null,
    lastSyncAt: null,
    workerRunning: false,
    officialClient: profile === "official" ? { phase: "installed" } : null,
    ...extra
  };
}

export const obsidianConfigurationFixtures = [
  obsidianConfiguration(status("none", "setup-required")),
  obsidianConfiguration(status("official", "client-install-required", { officialClient: { phase: "not-installed" } })),
  obsidianConfiguration(status("official", "setup-required")),
  obsidianConfiguration(status("official", "vault-selection-required"), {
    vaults: [{ id: "remote-vault", name: "Research" }]
  }),
  obsidianConfiguration(status("official", "ready", { remoteVault: "Research", workerRunning: true })),
  obsidianConfiguration(status("livesync", "setup-required")),
  obsidianConfiguration(status("livesync", "livesync-preparing")),
  obsidianConfiguration(status("livesync", "livesync-device-setup")),
  obsidianConfiguration(status("livesync", "livesync-server-joining")),
  obsidianConfiguration(
    status("livesync", "ready", {
      remoteVault: "Self-hosted LiveSync",
      liveSyncWorker: { running: true }
    })
  ),
  obsidianConfiguration(status("livesync", "recovery-required", { lastError: "Restore the original connection." })),
  obsidianConfiguration(status("livesync", "livesync-device-setup"), {
    deviceConnectionUrl: "https://vault.example.ts.net:8443",
    values: { repairConnection: true }
  }),
  obsidianConfiguration(
    status("livesync", "ready", {
      liveSyncWorker: { running: false, lastError: "The sync worker could not reconnect." }
    })
  ),
  obsidianConfiguration(
    status("official", "client-install-required", { officialClient: { phase: "verifying", approvedVersion: "1.0.21" } })
  ),
  obsidianConfiguration(
    status("official", "client-install-required", {
      officialClient: { phase: "failed", error: "The download could not be verified." }
    })
  )
];

const emptyRegistry = { schemaVersion: 1, revision: 1, vaults: [] };
const registry = {
  schemaVersion: 1,
  revision: 3,
  vaults: [
    { id: "research", label: "Research", source: "official", layout: "managed", aiEnabled: true },
    { id: "notes", label: "Notes", source: "livesync", layout: "managed", aiEnabled: false }
  ]
};

export const obsidianMultiVaultFixtures = {
  "vaults-empty": vaultsConfiguration(emptyRegistry),
  "setup-empty": selectedVaultConfiguration(emptyRegistry, null, "empty"),
  "access-empty": vaultAccessConfiguration(emptyRegistry, null, "empty"),
  "vaults-added": vaultsConfiguration(registry),
  "setup-official-ready": selectedVaultConfiguration(registry, registry.vaults[0], "mixed", {
    childSection: obsidianConfiguration(
      status("official", "ready", {
        remoteVault: "Research",
        scopePath: "Research",
        workerRunning: true
      })
    )
  }),
  "setup-livesync-ready": selectedVaultConfiguration(registry, registry.vaults[1], "mixed", {
    childSection: obsidianConfiguration(
      status("livesync", "ready", {
        remoteVault: "Self-hosted LiveSync",
        liveSyncWorker: { running: true }
      })
    )
  }),
  "setup-livesync-device": selectedVaultConfiguration(registry, registry.vaults[1], "device", {
    childSection: obsidianConfiguration(status("livesync", "livesync-device-setup"))
  }),
  "setup-storage-error": selectedVaultConfiguration(registry, registry.vaults[1], "damaged", {
    workerError: "This vault's storage needs recovery."
  }),
  "access-research": vaultAccessConfiguration(registry, registry.vaults[0], "mixed"),
  "access-notes-disabled": vaultAccessConfiguration(registry, registry.vaults[1], "mixed")
};
