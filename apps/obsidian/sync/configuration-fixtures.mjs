import { obsidianConfigurationFixtures } from "./configuration.fixtures.mjs";

export async function configurationFixtureCases() {
  const names = [
    "method-choice",
    "official-install",
    "official-account",
    "official-vault",
    "official-ready",
    "livesync-setup",
    "livesync-preparing",
    "livesync-device",
    "livesync-joining",
    "livesync-ready",
    "livesync-recovery"
  ];
  return Object.fromEntries(names.map((name, index) => [name, obsidianConfigurationFixtures[index]]));
}
