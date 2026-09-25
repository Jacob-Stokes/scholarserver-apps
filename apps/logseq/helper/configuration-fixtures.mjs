import { logseqConfigurationFixtures } from "./configuration.fixtures.mjs";

export async function configurationFixtureCases() {
  const names = [
    "private-address",
    "account-start",
    "account-waiting",
    "notebook-choice",
    "downloading",
    "download-retry",
    "ready"
  ];
  return Object.fromEntries(names.map((name, index) => [name, logseqConfigurationFixtures[index]]));
}
