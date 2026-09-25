import { managerConfigurationSection } from "./manager-configuration.mjs";

const inventory = {
  read: async () => ({
    installations: {
      installed: { state: "installed" },
      uncertain: { state: "unconfirmed" }
    }
  })
};

function setup(status) {
  return { status: async () => status };
}

export async function configurationFixtureCases() {
  const fresh = setup({ connected: false, phase: "password-required", ownerEmail: "owner@scholarserver.invalid" });
  const existing = setup({ connected: false, phase: "existing-account" });
  const resume = setup({ connected: false, phase: "resume", ownerEmail: "owner@scholarserver.invalid" });
  const recovery = setup({ connected: false, phase: "recovery-required" });
  const ready = setup({ connected: true, phase: "ready" });
  return {
    "n8n-new-owner": await managerConfigurationSection("connection", fresh, inventory),
    "n8n-existing-owner-mfa": await managerConfigurationSection("connection", existing, inventory),
    "n8n-resume-mfa": await managerConfigurationSection("connection", resume, inventory),
    "n8n-recovery": await managerConfigurationSection("connection", recovery, inventory),
    "n8n-ready": await managerConfigurationSection("connection", ready, inventory),
    "n8n-settings": await managerConfigurationSection("settings", ready, inventory)
  };
}
