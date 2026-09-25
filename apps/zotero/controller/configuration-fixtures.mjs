import { zoteroConfigurationFixtures } from "./configuration.fixtures.mjs";

export async function configurationFixtureCases() {
  const names = [
    "online-account",
    "online-storage",
    "online-ready",
    "desktop-account",
    "desktop-pending",
    "desktop-storage",
    "desktop-webdav",
    "desktop-authorization",
    "desktop-ready",
    "desktop-recovery"
  ];
  return Object.fromEntries(names.map((name, index) => [name, zoteroConfigurationFixtures[index]]));
}
