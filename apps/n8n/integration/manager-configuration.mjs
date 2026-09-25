import { createHash } from "node:crypto";

function revisionOf(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 24);
}

function setupFields(status) {
  if (status.phase === "ready" || status.phase === "setting-up" || status.phase === "recovery-required") return [];
  const fresh = status.phase === "password-required";
  const existing = status.phase === "existing-account" || status.phase === "connection-error";
  const fields = [];
  if (existing)
    fields.push({
      id: "email",
      label: "Existing n8n owner email",
      type: "email",
      required: true,
      autocomplete: "username"
    });
  fields.push({
    id: "password",
    label: "Password",
    type: "secret",
    required: true,
    minLength: 8,
    maxLength: 64,
    autocomplete: fresh ? "new-password" : "current-password",
    hint: fresh
      ? "Use 8–64 characters, including an uppercase letter and a number."
      : "Enter the owner's existing password."
  });
  if (fresh)
    fields.push({
      id: "confirmPassword",
      label: "Confirm password",
      type: "secret",
      required: true,
      confirmField: "password",
      autocomplete: "new-password"
    });
  if (!fresh)
    fields.push({
      id: "mfaCode",
      label: "Authentication code",
      type: "secret",
      required: false,
      minLength: 6,
      maxLength: 6,
      autocomplete: "one-time-code",
      hint: "Enter the six-digit code if two-factor authentication is enabled."
    });
  return fields;
}

export async function managerConfigurationSection(sectionId, passwordSetup, installations) {
  if (sectionId !== "connection" && sectionId !== "settings") return null;
  const status = await passwordSetup.status();
  const ready = status.phase === "ready" && status.connected;
  const revision = revisionOf({
    phase: status.phase,
    ownerEmail: status.ownerEmail ?? null,
    connected: status.connected
  });
  const base = {
    version: 1,
    id: sectionId,
    revision,
    pollAfterMs: ready ? 30_000 : 5_000,
    notices: [],
    fields: [],
    values: {},
    summary: [],
    actions: []
  };
  if (sectionId === "connection") {
    let description = "Sign in to connect n8n. Existing accounts and workflows are not replaced.";
    if (ready) description = "n8n is connected to ScholarServer.";
    else if (status.phase === "password-required")
      description = "Set your local n8n owner password to finish installation.";
    let notice = null;
    if (status.phase === "recovery-required")
      notice = {
        kind: "error",
        text: "A previous setup exists, but n8n has no owner account. Restore its application data before continuing. No account has been reset."
      };
    if (status.phase === "setting-up")
      notice = {
        kind: "info",
        text: "n8n setup is running. Check status before continuing."
      };
    const fields = setupFields(status);
    return {
      ...base,
      title: ready ? "n8n connection" : "Finish connecting n8n",
      description,
      stage: { id: ready ? "ready" : "connection", label: ready ? "Ready" : "Connect n8n", index: 1, total: 2 },
      notices: notice ? [notice] : [],
      fields,
      summary: [
        { label: "Connection", value: ready ? "Ready" : "Setup needed" },
        ...(status.ownerEmail ? [{ label: "Owner sign-in", value: status.ownerEmail }] : [])
      ],
      actions: fields.length
        ? [
            {
              id: "setup",
              label: status.phase === "password-required" ? "Finish installation" : "Connect n8n",
              kind: "submit",
              fieldIds: fields.filter((field) => field.id !== "confirmPassword").map((field) => field.id),
              target: { kind: "instance-action", actionId: "setup" }
            }
          ]
        : []
    };
  }
  const inventory = await installations.read();
  const installed = Object.values(inventory.installations ?? {}).filter((item) => item.state === "installed").length;
  const needsReview = Object.values(inventory.installations ?? {}).filter((item) => item.state !== "installed").length;
  return {
    ...base,
    title: "Automation settings",
    description: "Review your automations and their schedules in Automations.",
    stage: { id: "settings", label: "Automation settings", index: 2, total: 2 },
    summary: [
      { label: "Connection", value: ready ? "Ready" : "Setup needed" },
      { label: "Installed automations", value: String(installed) },
      { label: "Needs review", value: String(needsReview) }
    ],
    instructions: [
      {
        title: "Review automations",
        text: "Use Automations to manage workflows and execution checks."
      }
    ]
  };
}
