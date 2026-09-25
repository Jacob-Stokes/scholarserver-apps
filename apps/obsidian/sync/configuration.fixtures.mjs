import { obsidianConfiguration } from "./configuration.mjs";

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
  obsidianConfiguration(status("livesync", "ready", { remoteVault: "Self-hosted LiveSync", workerRunning: true })),
  obsidianConfiguration(status("livesync", "recovery-required", { lastError: "Restore the original connection." }))
];
