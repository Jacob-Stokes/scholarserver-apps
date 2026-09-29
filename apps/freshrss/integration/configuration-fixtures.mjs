import { configurationSection } from "./configuration.mjs";

function fixtureSetup(status, style = "original") {
  return {
    status: async () => status,
    appearance: async () => ({ style })
  };
}

export async function configurationFixtureCases() {
  const unlinked = fixtureSetup({ phase: "starting", ready: false, username: null, signIn: "password" });
  const ready = fixtureSetup({ phase: "ready", ready: true, username: "researcher", signIn: "scholarserver" });
  const workerError = fixtureSetup({
    phase: "preparing",
    ready: false,
    username: "researcher",
    signIn: "scholarserver",
    error: "The reader is not responding yet."
  });
  return {
    "freshrss-unlinked": await configurationSection(unlinked, "account"),
    "freshrss-linked": await configurationSection(ready, "account"),
    "freshrss-appearance": await configurationSection(ready, "appearance"),
    "freshrss-worker-error": await configurationSection(workerError, "account"),
    "freshrss-appearance-unavailable": await configurationSection(workerError, "appearance")
  };
}
